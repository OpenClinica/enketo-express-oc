'use strict';

var $ = require( 'jquery' );

$(document).keydown(function(e) {
    if (e.key === 'Tab') {
        let currentFocus = $(':focus');
        if (currentFocus.is('input[type=radio]')) {
            let name = currentFocus.attr('name');
            let allRadiosSameName = $('input[type=radio][name="' + name +  '"]');
            let currentRadio = allRadiosSameName.index(currentFocus);
            let nextRadio = allRadiosSameName[currentRadio + 1];
            if (nextRadio) {
                nextRadio.focus();
                e.preventDefault();
            }
        }
    }
});