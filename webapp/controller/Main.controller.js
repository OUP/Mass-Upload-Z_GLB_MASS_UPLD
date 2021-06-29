/*
 * Copyright (C) 2009-2020 SAP SE or an SAP affiliate company. All rights reserved.
 */

sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/unified/FileUploaderParameter",
    "sap/ui/table/Table",
    "sap/ui/table/Column",
    "sap/ui/table/RowSettings",
    "sap/m/Text",
    "sap/m/MessageToast",
  ],
  function (
    Controller,
    JSONModel,
    FileUploaderParameter,
    Table,
    Column,
    RowSettings,
    Text,
    MessageToast
  ) {
    "use strict";

    let _oView = null;
    const _sUrlCheck = "/sap/opu/odata/sap/ZGLB_MASSUPLOAD_SRV/FileContentsSet";

    return Controller.extend("oup.glb.zglbmassupload.controller.Main", {
      /* =========================================================== */
      /* lifecycle methods                                           */
      /* =========================================================== */

      /**
       * Called when the worklist controller is instantiated.
       * @public
       */
      onInit: function () {
        _oView = this.getView();

        // apply content density mode to root view
        _oView.addStyleClass(this.getOwnerComponent().getContentDensityClass());

        let oViewModel,
          oTable = _oView.byId("idWorkListTableContainer");

        this._oTableContainer = oTable;
        this._oTableContainer.setVisible(false);
        this.oMsgStripMessage = this.byId("idMsgStripMessage");
        this.oMsgStripWarningProtocol = this.byId("idMsgStripWarningProtocol");
        this.oMsgStripErrorProtocol = this.byId("idMsgStripErrorProtocol");
        this.oMsgStripSuccessProtocol = this.byId("idMsgStripSuccessProtocol");
        this.initMessageStrips();

        // Model used to manipulate control states
        oViewModel = new JSONModel({
          saveAsTileTitle: this.getResourceBundle().getText(
            "worklistViewTitle"
          ),
          shareOnJamTitle: this.getResourceBundle().getText(
            "worklistViewTitle"
          ),
          tableNoDataText: this.getResourceBundle().getText("tableNoDataText"),
          tableDataRetrievingText: this.getResourceBundle().getText(
            "tableDataRetrievingText"
          ),
        });
        this.setModel(oViewModel, "worklistView");

        /*
         * View Model
         * Collection of separators displayed in combo box
         */
        this.setModel(
          new JSONModel(this.getSeparators()),
          "SeparatorCollection"
        );

        // odata model
        this.oOdataModel = this.getOwnerComponent().getModel();

        /*
         * File uploader
         * add csrf header token
         */
        let oFileUploader = _oView.byId("fileUploader");
        let sToken = this.oOdataModel.getSecurityToken();
        let oHeaderParameter = new FileUploaderParameter({
          name: "X-CSRF-Token",
          value: sToken,
        });
        oFileUploader.addHeaderParameter(oHeaderParameter);
      },

      /**
       * Getter for the resource bundle.
       * @public
       * @returns {sap.ui.model.resource.ResourceModel} the resourceModel of the component
       */
      getResourceBundle: function () {
        return this.getOwnerComponent().getModel("i18n").getResourceBundle();
      },

      /**
       * Convenience method for setting the view model.
       * @public
       * @param {sap.ui.model.Model} oModel the model instance
       * @param {string} sName the model name
       * @returns {sap.ui.mvc.View} the view instance
       */
      setModel: function (oModel, sName) {
        return _oView.setModel(oModel, sName);
      },

      onDialogClose: function (oEvent) {
        oEvent.getSource().getParent().close();
      },

      onFileChange: function (oEvent) {
        this.initMessageStrips();

        let oFiles = oEvent.getParameter("files");
        let oFileUploader = _oView.byId("fileUploader");

        if (oFiles.length === 0) {
          this._oTableContainer.setVisible(false);
        } else {
          // commented out, otherwise after a GW 500 error (timeout) error the table is displayed without data when a new file is selected
          this._oTableContainer.setVisible(false);

          //reset properties when selecting a new file
          oFileUploader.setUploadUrl(_sUrlCheck);

          let sTemplateID = oFiles[0].name.substr(0, 3);

          // save globally
          this._sTemplateID = sTemplateID;

          if (isNaN(sTemplateID, 10)) {
            this.oMsgStripErrorProtocol.setVisible(true);
            this.oMsgStripErrorProtocol.setText(
              "No template id found in the provided file name, kindly provide template id in the file name to understand the file type." +
                "\n\nSample file name with template id - 'XXX_FileName.csv'"
            );

            // clear file uploader
            oFileUploader.clear();

            // exit the file uploader
            return;
          }

          // remove existing all headers
          const aHeaderParameters = oFileUploader.getHeaderParameters();
          let oParameter;

          for (oParameter of aHeaderParameters) {
            if (oParameter.getProperty("name") === "slug") {
              // remove slug from header parameters
              oFileUploader.removeHeaderParameter(oParameter);
              break;
            }
          }

          // add slug to file uploader header
          const oHeaderParameter = new FileUploaderParameter({
            name: "slug",
            value: sTemplateID,
          });
          oFileUploader.addHeaderParameter(oHeaderParameter);
        }

        // deactivate import button
        this.byId("idBtnImport").setEnabled(false);
        this.byId("idBtnTest").setEnabled(false);

        //set busy indicator only if allowed file was selected
        if (oEvent.getParameter("newValue") === "") {
          if (this._oBusyDialog) {
            this._oBusyDialog.close();
          }
        } else {
          this._initializeBusyIndicator();
          this._oBusyDialog
            .open()
            .setText(this.getResourceBundle().getText("busyFileAnalysis"));

          // upload file
          oFileUploader.upload();
        }
        this._timeStampStartUpload = Date.now();
      },

      onPressTestImport: function () {
        this._importFile(true, false);
      },

      onPressImport: function () {
        this._importFile(false, true);
      },

      onPressBtnTempDown: function () {
        let oDialog = _oView.byId("tempDialog");

        // create dialog lazily
        if (!oDialog) {
          // create dialog via fragment factory
          oDialog = sap.ui.xmlfragment(
            _oView.getId(),
            "oup.glb.zglbmassupload.view.fragment.TempDialog",
            this
          );
          _oView.addDependent(oDialog);
        }
        oDialog.open();
      },

      onTypeMissmatch: function () {
        this.oMsgStripErrorProtocol.setText(
          this.getResourceBundle().getText("noCSVFile")
        );
      },

      onUploadComplete: function (oEvent) {
        // check if server returns error code (for instance inactive virus scan profile)
        if (oEvent.getParameters().status >= 400) {
          this._handleErrorOnUploadComplete(oEvent).catch(() =>
            this.oMsgStripErrorProtocol.setText(
              this.getResourceBundle().getText("serverError")
            )
          );
        } else {
          // means, sStatus < 400 => file has been uploaded and uuid is returned
          let sResponse = this.getResultFromFileCheck(
            oEvent.getParameters().response
          ).x;

          // check if warning was returned:
          // file has been checked successfully
          // create model with delete scope
          // Set message strip for warnings only (i.e. no errors)
          if (sResponse === "warning") {
            // this.setMsgStripWarningProtocol(this.getResourceBundle().getText("checkFileWarning"));
          }

          // check if error was returned from backend:
          if (sResponse === "error") {
            //file contains errors
            if (this._oBusyDialog) {
              this._oBusyDialog.close();
            }
            this._oTableContainer.setVisible(false);
          }
          // file was processed => retrieve relevant data from backend:
          if (sResponse === "success" || sResponse === "warning") {
            this.oMsgStripMessage.setVisible(true);
            this.oMsgStripMessage.setText(
              "Template has successfully load. Kindly select Test import source file/ Import source file to perform import action"
            );
            // load table from the response
            this._loadResponseTable(false, false).finally(() => {
              // temp - close the busy dialog
              if (this._oBusyDialog) {
                this._oBusyDialog.close();
              }

              // enable test import button on success of file upload
              this.byId("idBtnTest").setEnabled(true);

              // clear file uploader
              let oFileUploader = _oView.byId("fileUploader");
              oFileUploader.clear();
            });
          }
        }
      },

      _isTimeOut: function (startTime, statusCode) {
        let _270seconds = 270000;
        return (
          Date.now() - startTime > _270seconds &&
          (statusCode === 504 || statusCode === 500)
        );
      },

      _isCSRFTokenError: function (response, statusCode) {
        //Heuristic: If statusCode is 403 and the response conatins "CSRF" then we assume, that we have no valid CSRF Token
        return statusCode === 403 && response.includes("CSRF");
      },

      _handleErrorOnUploadComplete: function (oEvent) {
        return new Promise((resolve, reject) => {
          //this._oTableContainer.setBusy(false);
          if (this._oBusyDialog) {
            this._oBusyDialog.close();
          }
          this._oTableContainer.setVisible(false);
          if (
            this._isTimeOut(
              this._timeStampStartUpload,
              oEvent.getParameters().status
            )
          ) {
            this.oMsgStripErrorProtocol.setText(
              this.getResourceBundle().getText("fileIsProbablyTooBig")
            );
            resolve();
          } else if (
            this._isCSRFTokenError(
              oEvent.getParameters().responseRaw,
              oEvent.getParameters().status
            )
          ) {
            this.oMsgStripErrorProtocol.setText(
              this.getResourceBundle().getText("probablyCSRFTokenInvalid")
            );
            resolve();
          } else {
            try {
              //No timeout, check whether it is an OData-Error and take the leading message of the message container
              let aText = oEvent.getParameters().responseRaw;
              let parser = new DOMParser();
              let xmlDoc = parser.parseFromString(aText, "text/xml");
              if (xmlDoc.getElementsByTagName("message").length > 0) {
                //Take the first (leading) message
                this.oMsgStripErrorProtocol.setText(
                  xmlDoc.getElementsByTagName("message")[0].innerHTML
                );
                resolve();
              } else {
                reject();
              }
            } catch (e) {
              reject();
            }
          }
        });
      },

      getResultFromFileCheck: function (strResponse) {
        let out = {
          x: "success",
          y: null,
        };

        //use regular expression to retrieve the UUID from the response message
        let myregex = /\w\w\w\w\w\w\w\w-\w\w\w\w-\w\w\w\w-\w\w\w\w-\w\w\w\w\w\w\w\w\w\w\w\w/;
        let matches = myregex.exec(strResponse);

        //out.y contains the uuid
        if (matches === null) {
          //this._oTableContainer.setBusy(false);
          if (this._oBusyDialog) {
            this._oBusyDialog.close();
          }
          this._oTableContainer.setVisible(false);
          this.oMsgStripErrorProtocol.setText(
            this.getResourceBundle().getText("serverError")
          );
          out.x = "timeout";
        } else {
          let fileid = matches[0].replace(/-/g, "");
          let edmguid = new sap.ui.model.odata.type.Guid();
          let res = edmguid.parseValue(fileid, "string");
          out.y = res;

          if (strResponse.search("FileName='ERROR'") !== -1) {
            out.x = "error";
          }
          if (strResponse.search("FileName='WARNING'") !== -1) {
            out.x = "warning";
          }
          this._sUuidUpload = res;
          // this._sLogHandle = this._getLogHandle(strResponse);
        }
        return out;
      },

      /* =========================================================== */
      /* event handlers                                              */
      /* =========================================================== */

      _importFile: function (bTest, bImport) {
        this._initializeBusyIndicator();
        this.initMessageStrips();
        this._oBusyDialog
          .open()
          .setText(this.getResourceBundle().getText("busyFileImport"));

        let oImportBtn = this.byId("idBtnImport");
        let oTestBtn = this.byId("idBtnTest");

        // on test success
        const fnSuccess = () => {
          if (bTest) {
            oImportBtn.setEnabled(!this._bErrorFlag);
          }

          // on import success
          if (bImport) {
            oImportBtn.setEnabled(false);
            oTestBtn.setEnabled(false);
          }
        };

        // on test error
        const fnError = (_oError) => {
          this._oTableContainer.setVisible(false);
          this.oMsgStripErrorProtocol.setVisible(true);
          this.oMsgStripErrorProtocol.setText(
            this.getResourceBundle().getText("errorText")
          );

          // disable Import if there is any error in upload
          if (bTest || bImport) {
            oImportBtn.setEnabled(!this._bErrorFlag);
          }
        };

        // close busy dialog
        const fnFinal = () => {
          setTimeout(() => {
            if (this._oBusyDialog) {
              this._oBusyDialog.close();
            }
          }, 200);
        };

        this._loadResponseTable(bTest, bImport)
          .then(fnSuccess)
          .catch(fnError)
          .finally(fnFinal);
      },

      getSeparators: function () {
        let dataSeparators = {
          items: [
            {
              key: "1",
              character: ",",
              text: this.getResourceBundle().getText("lbComma"),
            },
          ],
        };
        return dataSeparators;
      },

      initMessageStrips: function () {
        this.oMsgStripMessage.setVisible(false);
        this.oMsgStripWarningProtocol.setVisible(false);
        this.oMsgStripErrorProtocol.setVisible(false);
        this.oMsgStripSuccessProtocol.setVisible(false);
      },

      /* =========================================================== */
      /* internal methods                                            */
      /* =========================================================== */

      /**
       * Shows the selected item on the object page
       * On phones a additional history entry is created
       * @param {sap.m.ObjectListItem} oItem selected Item
       * @private
       */
      _showObject: function (oItem) {
        this.getRouter().navTo("object", {
          objectId: oItem.getBindingContext().getProperty("Number"),
        });
      },

      _loadResponseTable: function (bTest, bImport) {
        return new Promise((resolve, reject) => {
          // destory the item present in the table container
          this._oTableContainer.destroyItems();

          const fnSuccess = (oDataResponse) => {
            try {
              let aHeaderDataFields = oDataResponse.toHeader.results || [];
              let aItemDataFields = oDataResponse.toItem.results || [];
              let aTableProperties = [];
              let sStatusFieldProperty = "";

              // create new sap.ui.table.GridTable
              let oTable = new Table({
                title: "ITEMS (" + aItemDataFields.length + ")",
                visibleRowCountMode: "Auto",
                selectionMode: "None",
                minAutoRowCount: 10,
              }).addStyleClass("sapUiSmallMargin");

              // identify columns
              for (let [index, oData] of aHeaderDataFields.entries()) {
                // push to table property array
                aTableProperties.push({
                  property: `Field${index + 1}`,
                  label: oData.Name,
                });
              }

              // add columns to table
              for (let oData of aTableProperties) {
                // row highlight on test import
                // check for status field
                if (oData.label.toUpperCase() === "ZSTATUS") {
                  // save status field property to check errors found
                  sStatusFieldProperty = oData.property;

                  // status row setting for table
                  oTable.setRowSettingsTemplate(
                    new RowSettings({
                      highlight: `{${oData.property}}`,
                    })
                  );
                } else {
                  // value
                  let oControl = new Text({
                    text: `{${oData.property}}`,
                    wrapping: false,
                  });

                  // label
                  let oColumn = new Column({
                    label: new Text({
                      text: oData.label,
                    }),
                    template: oControl,
                    width:
                      oData.label.toUpperCase() === "MESSAGE"
                        ? "45rem"
                        : "7.5rem",
                  });

                  // add column to table
                  oTable.addColumn(oColumn);
                }
              }

              // table model
              oTable.setModel(new JSONModel(aItemDataFields));

              // table binding
              let oBindingInfo = oTable.getBindingInfo("rows");
              oTable.bindRows(
                oBindingInfo || {
                  path: "/",
                }
              );

              // set visibility
              this._oTableContainer.setVisible(true);

              // add item to aggregation
              this._oTableContainer.addItem(oTable);

              if (bTest) {
                this._bErrorFlag = false;
                let aErrorRowIndex = [];

                for (let [index, oData] of aItemDataFields.entries()) {
                  if (oData[sStatusFieldProperty] === "Error") {
                    this._bErrorFlag = true;
                    aErrorRowIndex.push(index + 1);
                  }
                }

                if (aErrorRowIndex.length !== 0) {
                  this.oMsgStripErrorProtocol.setVisible(true);
                  this.oMsgStripErrorProtocol.setText(
                    "Kinldy fix the errors in below rows " +
                      aErrorRowIndex.join(", ") +
                      ".\n\nRe-run the Test import to ensure there are no errors before Import."
                  );
                } else {
                  this.oMsgStripMessage.setVisible(true);
                  this.oMsgStripMessage.setText(
                    "Your application data import will create " +
                      aItemDataFields.length +
                      " new items."
                  );
                }
              } else if (bImport) {
                // success message
                this.oMsgStripSuccessProtocol.setVisible(true);
                this.oMsgStripSuccessProtocol.setText(
                  "Application data is created successfully."
                );
              }

              // promise return
              resolve();
            } catch (error) {
              // error in loading file
              MessageToast.show("Error " + error);

              // promise return
              reject();
            }
          };

          const fnError = (_oErrorResponse) => {
            // error in loading file
            MessageToast.show("Error in loading file");

            // promise return
            reject();
          };

          let sAction = "";
          if (bTest || bImport) {
            sAction = bTest ? "TestImport" : "Import";
          }

          let sURL = `/ActionSet(TemplateID='${this._sTemplateID}',FileID=guid'${this._sUuidUpload}',Name='${sAction}')`;

          // read the fields of aggregation level using OData in JSON model
          this.oOdataModel.read(sURL, {
            urlParameters: {
              $expand: "toHeader,toItem",
            },
            success: fnSuccess,
            error: fnError,
          });
        });
      },

      _initializeBusyIndicator: function () {
        if (!this._oBusyDialog) {
          // attach a fragment at the first call:
          this._oBusyDialog = sap.ui.xmlfragment(
            _oView.getId(),
            "oup.glb.zglbmassupload.view.fragment.BusyDialog",
            this
          );
          _oView.addDependent(this._oBusyDialog);
        }
      },
    });
  }
);
