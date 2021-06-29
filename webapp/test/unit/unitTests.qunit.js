/* global QUnit */
QUnit.config.autostart = false;

sap.ui.getCore().attachInit(function () {
	"use strict";

	sap.ui.require([
		"oupglb./z_glb_mass_upload/test/unit/AllTests"
	], function () {
		QUnit.start();
	});
});
