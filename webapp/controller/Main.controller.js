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
    "sap/ui/export/library",
    "sap/ui/export/Spreadsheet",
    "sap/m/Text",
    "sap/m/MessageToast",
    "sap/m/OverflowToolbar",
    "sap/m/Button",
    "sap/m/ToolbarSpacer",
    "sap/m/Title",
  ],
  function (
    Controller,
    JSONModel,
    FileUploaderParameter,
    Table,
    Column,
    RowSettings,
    exportLibrary,
    Spreadsheet,
    Text,
    MessageToast,
    OverflowToolbar,
    Button,
    ToolbarSpacer,
    Title
  ) {
    "use strict";

    let _oView = null;
    const _sUrlCheck = "/sap/opu/odata/sap/ZGLB_MASSUPLOAD_SRV/FileContentsSet";
    const EdmType = exportLibrary.EdmType;
    let _aColumnConfig = [];
    let _bClientDownload = false;

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

          if (sTemplateID === "003") {
            // create runtime csv and call the fileuploader manually
            this._loadCustomFileUpload(oFiles[0], sTemplateID);

            // clear file uploader
            oFileUploader.clear();

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
          this.oMsgStripErrorProtocol.setVisible(true);
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

            // error message for template issue
            this.oMsgStripErrorProtocol.setVisible(true);
            this.oMsgStripErrorProtocol.setText(
              this.getResourceBundle().getText("templateError")
            );
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

        // on test error
        const fnError = (_oError) => {
          this._oTableContainer.setVisible(false);
          this.oMsgStripErrorProtocol.setVisible(true);
          this.oMsgStripErrorProtocol.setText(
            this.getResourceBundle().getText("errorText")
          );
        };

        // close busy dialog
        const fnFinal = () => {
          setTimeout(() => {
            if (this._oBusyDialog) {
              this._oBusyDialog.close();
            }
          }, 200);
        };

        this._loadResponseTable(bTest, bImport).catch(fnError).finally(fnFinal);
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

              //Overflow Toolbar
              var oOverflowToolbar = new OverflowToolbar({
                content: [
                  new Title({ text: "ITEMS (" + aItemDataFields.length + ")" }),
                  new ToolbarSpacer(),
                  new Button({
                    id: "idDownloadResultsBtn",
                    text: "Download",
                    icon: "sap-icon://excel-attachment",
                    enabled: false,
                    press: () => {
                      if (_bClientDownload) {
                        this._downloadExcel(aItemDataFields);
                      } else {
                        this.onPressDownloadBtn();
                      }
                    },
                  }),
                ],
              });

              // create new sap.ui.table.GridTable
              let oTable = new Table({
                visibleRowCountMode: "Auto",
                selectionMode: "None",
                minAutoRowCount: 8,
                extension: [oOverflowToolbar],
                layoutData: [
                  new sap.m.FlexItemData({
                    growFactor: 1,
                    baseSize: "0%",
                  }),
                ],
              }).addStyleClass("sapUiSmallMargin");

              // identify columns
              for (let [index, oData] of aHeaderDataFields.entries()) {
                // push to table property array
                aTableProperties.push({
                  property: `Field${index + 1}`,
                  label: oData.Name,
                });
              }

              /// reset column config
              _aColumnConfig = [];

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
                    autoResizable: true,
                    label: new Text({
                      text: oData.label,
                    }),
                    template: oControl,
                    width: "auto",
                    // width:
                    //   oData.label.toUpperCase() === "MESSAGE"
                    //     ? "45rem"
                    //     : "7.5rem",
                  });

                  // add column to table
                  oTable.addColumn(oColumn);
                }

                /// add column in excel
                _aColumnConfig.push({
                  label: oData.label,
                  property: oData.property,
                });
              }

              const onAfterRendering = (_) => {
                let oTpc = null;
                if (sap.ui.table.TablePointerExtension) {
                  oTpc = new sap.ui.table.TablePointerExtension(oTable);
                } else {
                  oTpc = new sap.ui.table.extensions.Pointer(oTable);
                }
                const aColumns = oTable.getColumns();
                for (let i = aColumns.length; i >= 0; i--) {
                  oTpc.doAutoResizeColumn(i);
                }
              };

              // add event delegate for onafter rendering
              oTable.addEventDelegate({
                onAfterRendering,
              });

              // table model
              oTable.setModel(new JSONModel(aItemDataFields));

              // if no entries hide the table
              oTable.setVisible(aItemDataFields.length !== 0);

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

              let bEnableTestBtn = false;
              let bEnableImportBtn = false;

              if (sAction !== "Import") {
                this._bErrorFlag = false;
                let aErrorRowIndex = [];

                for (let [index, oData] of aItemDataFields.entries()) {
                  if (oData[sStatusFieldProperty] === "Error") {
                    this._bErrorFlag = true;
                    aErrorRowIndex.push(index + 1);
                  }
                }

                // errors found
                if (aErrorRowIndex.length !== 0) {
                  this.oMsgStripMessage.setVisible(false);
                  this.oMsgStripErrorProtocol.setVisible(true);
                  let sErrorIndexs = aErrorRowIndex.join(", ");
                  let sErrorMsg = `Kindly fix the errors in below rows ${sErrorIndexs}.
                    
                                   Upload valid data to Test Import.`;

                  if (bTest) {
                    sErrorMsg = `Kindly fix the errors in below rows ${sErrorIndexs}.
                      
                                 Re-run the Test import to ensure there are no errors before Import.`;
                  }

                  // error message
                  this.oMsgStripErrorProtocol.setText(sErrorMsg);

                  // enable test import button on success of file upload
                  bEnableTestBtn = bImport;
                  bEnableImportBtn = bImport;
                }

                // no errors found
                else {
                  this.oMsgStripMessage.setVisible(true);

                  let sMsg;

                  if (aItemDataFields.length === 0) {
                    sMsg =
                      "Your Application data is ready for import.\n\nPlease proceed to Test Import.";
                  } else {
                    sMsg = `Your application data is ready for import will create ${aItemDataFields.length} new items.

                            Please proceed to Test Import.`;
                  }

                  if (bTest) {
                    if (aItemDataFields.length === 0) {
                      sMsg =
                        "Test Import is successful.\n\nPlease proceed to Import.";
                    } else {
                      sMsg = `Test Import is successful, Import will create ${aItemDataFields.length} new items.

                              Please proceed to Import.`;
                    }
                  }

                  this.oMsgStripMessage.setText(sMsg);

                  // enable test import button on success of file upload
                  bEnableTestBtn = true;
                  bEnableImportBtn = bTest;

                  /// enable download button
                  _bClientDownload = true;
                }
              } else {
                // success message
                this.oMsgStripSuccessProtocol.setVisible(true);
                this.oMsgStripSuccessProtocol.setText(
                  "Application data is created successfully."
                );

                /// enable download button
                _bClientDownload = false;
              }

              this.byId("idBtnTest").setEnabled(bEnableTestBtn);
              this.byId("idBtnImport").setEnabled(bEnableImportBtn);

              var oDownloadBtn = sap.ui.getCore().byId("idDownloadResultsBtn");
              oDownloadBtn.setEnabled(true);

              // promise return
              resolve();
            } catch (error) {
              // error in loading file
              MessageToast.show("Error " + error);

              // promise return
              reject();
            }
          };

          const fnError = (oErrorResponse) => {
            // error in loading file
            MessageToast.show("Error in loading file");

            // clear error messages
            this.initMessageStrips();

            const oParser = new DOMParser();
            const oXmlDoc = oParser.parseFromString(
              oErrorResponse.responseText,
              "text/xml"
            );
            const sMessage = oXmlDoc.getElementsByTagName("message")[0]
              .innerHTML;

            this.oMsgStripErrorProtocol.setVisible(true);
            this.oMsgStripErrorProtocol.setText(sMessage);

            // disable both buttons
            this.byId("idBtnTest").setEnabled(false);
            this.byId("idBtnImport").setEnabled(false);

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

      onPressDownloadBtn: function () {
        let sURL = `/sap/opu/odata/SAP/ZGLB_MASSUPLOAD_SRV/ExportResultSet(TemplateID='${this._sTemplateID}',FileID=guid'${this._sUuidUpload}')/$value`;
        sap.m.URLHelper.redirect(sURL);
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

      _loadCustomFileUpload: function (oFiles, sTemplateID) {
        let reader = new FileReader();
        reader.onload = (e) => {
          let workbook = XLSX.read(e.target.result, {
            type: "binary",
          });
          let iSheetIndex = 0;
          let aData = [];
          let sCSV = "";

          const fnArrayToCSV = (data) => {
            let csv = data.map((row) => Object.values(row));
            csv.unshift(Object.keys(data[0]));
            return csv.join("\n");
            // return `"${csv.join('"\n"').replace(/,/g, '","')}"`;
          };

          //   let sSheetName;

          //   if (sTemplateID === 003) {
          //     sSheetName = "Sales Order Template";
          //   }

          // loop all the available sheets and read the required ones
          workbook.SheetNames.forEach((sheetName) => {
            // if (sheetName !== sTemplateID) {
            //   return;
            // }

            // increment counter
            iSheetIndex++;

            // get the all rows data from the sheet
            var aRow = XLSX.utils.sheet_to_row_object_array(
              workbook.Sheets[sheetName]
            );

            // create csv file to send it to backend
            let aNewItems;
            if (sTemplateID === "003") {
              aNewItems = this._createCSV003(iSheetIndex, aRow);
            }

            // merge all the items to create csv and submit as a single request to backend
            for (let oItem of aNewItems) {
              aData.push(oItem);
            }
          });

          // convert array to csv
          sCSV = fnArrayToCSV(aData);

          // trigger backend request
          this._fnPost(sTemplateID, sCSV, oFiles.name);
        };

        // on error
        reader.onerror = (_) => sap.m.MessageToast.show("Fail to load file!");

        // read file as string
        reader.readAsBinaryString(oFiles);
      },

      _createCSV003: function (iSheetIndex, aRow) {
        let aData = [];
        let oHeaderItem = {
          SHEET_INDEX: iSheetIndex,
        };
        const oDateFormat = sap.ui.core.format.DateFormat.getDateInstance({
          pattern: "yyyyMMdd",
        });

        for (const row of aRow) {
          // template type - Gratis/ Internal/ External
          if (row.__rowNum__ === 6) {
            oHeaderItem.TEMPLATE = row.__EMPTY_10 || "";
            continue;
          }

          // second row
          // Customer name, Your reference number
          else if (row.__rowNum__ === 8) {
            oHeaderItem.CUST_NAME = row.__EMPTY_6 || "";
            oHeaderItem.REF_NO = row.__EMPTY_14 || "";
            continue;
          }

          // third row
          // Company name, Order date
          else if (row.__rowNum__ === 9) {
            oHeaderItem.COMP_NAME_1 = row.__EMPTY_6 || "";
            // formatted date
            oHeaderItem.ORDER_DATE =
              oDateFormat.format(new Date(row.__EMPTY_14)) || "";
            continue;
          }

          // four row
          // Address line 1, OUP Account Number
          else if (row.__rowNum__ === 10) {
            oHeaderItem.ADD_LIN_1 = row.__EMPTY_6 || "";
            oHeaderItem.OUP_ACC_NO = row.__EMPTY_14 || "";
            continue;
          }

          // five row
          // Address line 2, Order type
          else if (row.__rowNum__ === 11) {
            oHeaderItem.ADD_LIN_2 = row.__EMPTY_6 || "";
            oHeaderItem.ORD_TYPE = row.__EMPTY_14 || "";
            continue;
          }

          // six row
          // City / region, Order reason
          else if (row.__rowNum__ === 12) {
            oHeaderItem.CITY_REG = row.__EMPTY_6 || "";
            oHeaderItem.ORD_RES = row.__EMPTY_14 || "";
            continue;
          }

          // seven row
          // Postcode, Footnote text
          else if (row.__rowNum__ === 13) {
            oHeaderItem.POST_CODE = row.__EMPTY_6 || "";
            oHeaderItem.FOOT_TXT = row.__EMPTY_14 || "";
            continue;
          }

          // eight row
          // Country, Shipping method
          else if (row.__rowNum__ === 14) {
            oHeaderItem.COUNTRY = row.__EMPTY_6 || "";
            oHeaderItem.SHIP_MTD = row.__EMPTY_14 || "";
            continue;
          }

          // nineth row
          // Rep Name, Reference Invoice Number
          else if (row.__rowNum__ === 15) {
            oHeaderItem.REP_NAME = row.__EMPTY_6 || "";
            oHeaderItem.REF_INV_NO = row.__EMPTY_14 || "";
          }

          // tenth row
          // Rep Code, Sales Org
          else if (row.__rowNum__ === 16) {
            oHeaderItem.REP_CODE = row.__EMPTY_6 || "";
            oHeaderItem.SALES_ORG = row.__EMPTY_14 || "";
          }

          // ECC Customer Number
          else if (row.__rowNum__ === 17) {
            oHeaderItem.ECC_CUST_NO = row.__EMPTY_6 || "";
          }

          // eleventh row
          else if (row.__rowNum__ === 18) {
            // ECC Sales Order Number
            oHeaderItem.ECC_SO = row.__EMPTY_6 || "";

            // Special instructions
            oHeaderItem.SPL_INS = row.__EMPTY_13 || "";

            // skip special instruction default value
            if (oHeaderItem.SPL_INS === ">Special instructions<") {
              oHeaderItem.SPL_INS = "";
            }
          }

          // ignore title row
          if (row.__rowNum__ < 27) {
            continue;
          }

          let oItem = JSON.parse(JSON.stringify(oHeaderItem));

          /**
            __EMPTY_1: "Item Counter "
            __EMPTY_2: "Product Reference"
            __EMPTY_4: "Qty"
            __EMPTY_5: "Title "
            __EMPTY_9: "Line PO Number"
            __EMPTY_10: "Discount code"
            __EMPTY_11: "Value"
            __EMPTY_12: "BP Number "
            __EMPTY_13: "Customer name:"
            __EMPTY_14: "Address line 1"
            __EMPTY_15: "Address line 2"
            __EMPTY_16: "City / region"
            __EMPTY_17: "Postcode"
            __EMPTY_18: "Telephone Number"
            __EMPTY_19: "Email"
            __EMPTY_20: "Country"
         */

          // Item Counter
          oItem.I_COUNTER = row.__EMPTY_1 || "";

          // ISBN (13 Digit)
          oItem.I_ISBN = row.__EMPTY_2 || "";

          // Qty
          oItem.I_QUANTITY = row.__EMPTY_4 || "";

          // Title
          oItem.I_TITLE = row.__EMPTY_5 || "";

          // Line PO Number
          oItem.I_LINE_PO = row.__EMPTY_9 || "";

          // Discount code
          oItem.I_DIS_CODE = row.__EMPTY_10 || "";

          // Discount value
          oItem.I_DIS_VALUE = row.__EMPTY_11 || "";

          // BP Number
          oItem.I_BP_NO = row.__EMPTY_12 || "";

          // Customer name
          oItem.I_CUST_NAME = row.__EMPTY_13 || "";

          // Address line 1
          oItem.I_ADD_LINE_1 = row.__EMPTY_14 || "";

          // Address line 2
          oItem.I_ADD_LINE_2 = row.__EMPTY_15 || "";

          // City / region
          oItem.I_CITY_REG = row.__EMPTY_16 || "";

          // Postcode
          oItem.I_POST_CODE = row.__EMPTY_17 || "";

          // Telephone
          oItem.I_TELE_NUMBER = row.__EMPTY_18 || "";

          // Email
          oItem.I_EMAIL = row.__EMPTY_19 || "";

          // Country
          oItem.I_COUNTRY = row.__EMPTY_20 || "";

          aData.push(oItem);
        }

        return aData;
      },

      _fnPost: function (sTemplateID, sContent, sFileName) {
        // ajax setup
        jQuery.ajaxSetup({
          cache: false,
        });

        // remove file extension
        let sFileNameFormatted = sFileName.match(/([^\/]+)(?=\.\w+$)/)[0];

        // remove template id
        sFileNameFormatted = sFileNameFormatted.substr(4);

        // post request
        jQuery.ajax({
          url: _sUrlCheck,
          async: false,
          cache: false,
          data: sContent,
          type: "POST",
          beforeSend: (xhr) => {
            xhr.setRequestHeader(
              "x-csrf-token",
              this.oOdataModel.getSecurityToken()
            );
            xhr.setRequestHeader("Content-Type", "application/json"); // "text/csv"
            xhr.setRequestHeader(
              "slug",
              `${sTemplateID}|${sFileNameFormatted}`
            );
          },
          success: (oData) => {
            try {
              this._sUuidUpload = oData.firstElementChild
                .getElementsByTagName("m:properties")[0]
                .getElementsByTagName("d:FileID")[0].innerHTML;
              this._loadResponseTable(false, false);

              //   .finally(() => {
              //     // enable test import button on success of file upload
              //     this.byId("idBtnTest").setEnabled(true);
              //   });
            } catch (error) {
              sap.m.MessageToast.show("Failed to read File ID!");
            }
          },
          error: (oError, oResponse) => {
            try {
              const oParser = new DOMParser();
              const oXmlDoc = oParser.parseFromString(
                oError.responseText,
                "text/xml"
              );
              const sMessage = oXmlDoc.getElementsByTagName("message")[0]
                .innerHTML;

              this.oMsgStripErrorProtocol.setVisible(true);
              this.oMsgStripErrorProtocol.setText(
                `${sFileNameFormatted} - ${sMessage}`
              );
            } catch (error) {
              // un handled message
              sap.m.MessageToast.show("File Upload Error!");
            }
          },
        });
      },

      _downloadExcel: function (dataSource) {
        let oSettings, oSheet;

        oSettings = {
          workbook: { columns: _aColumnConfig },
          dataSource,
        };

        oSheet = new Spreadsheet(oSettings);
        oSheet
          .build()
          .then(function () {
            MessageToast.show("Spreadsheet export has finished");
          })
          .finally(oSheet.destroy);
      },
    });
  }
);
