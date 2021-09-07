// Modify the Enketo Core input module.

import inputModule from 'enketo-core/src/js/input';
import { Form } from './form';

// Obtain multiple constraints
inputModule.getConstraint = function( control ) {
    // The array index corresponds to the number used in oc:constraint
    // Note if a spot is missing, e.g. constraint11, this will (deliberately) result in an undefined value,

    return Form.constraintAttributes
        .map( attr => control.getAttribute( attr ) );
};


