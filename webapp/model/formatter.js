/*
 * Copyright (C) 2009-2020 SAP SE or an SAP affiliate company. All rights reserved.
 */
sap.ui.define([], function () {
  "use strict";

  return {
    /**
     * Rounds the number unit value to 2 digits
     * @public
     * @param {string} sValue the number string to be rounded
     * @returns {string} sValue with 2 digits rounded
     */
    numberUnit: function (sValue) {
      if (!sValue) {
        return "";
      }
      //critical statement
      return parseFloat(sValue).toFixed(2);
    },

    /**
     * Converts a string to a number.
     * If the number equals 0, the method returns an empty string.
     * @public
     * @param {string} string to convert
     * @returns {number} see descripton
     *
     */
    convertToNumber: function (string) {
      var number = Number(string);
      if (number === 0) {
        return "";
      }
      return number;
    },
  };
});
