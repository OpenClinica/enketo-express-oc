# Customizations

This is an overview of the customizations that were made in this fork.

### Discrepancy Note Widget
Multi-threaded widget that builds upon Enketo's basic comment widget. The widget enables users to discuss data, add queries or annotations (2 different note types) to individual questions, and view a log of various events such as value changes. Ability to Close or Reopen a query thread is restricted to specific user roles.
We automatically update all constraint and required logic (after Pyxform conversion) to include clauses for the item's query status. If an item has New, Updated, or Closed Query status, the constraint/required error is effectively suppressed. We added a new status (closed-modified) that is automatically assigned to a close Query thread when the item value changes to ensure that the error message can be displayed again in the future after the query has been closed.

[add screenshot]

### Handling Non-relevant questions that have values
As a rule, items with data are never hidden due to being irrelevant to ensure that users know what data exists in the record and do not mistakenly clear a section of data due to an errant click. If a item evaluates as non-relevant and is not null, a special error message is shown for the item.

### Strict required and strict constraints
Two additional 'strict' required and constraint types were added.
If a value is entered and it causes the item to have a strict constraint/required fire, the value is rejectd before being added to the model and an error popup appears. The item remains at its previous value. If a value is entered and it causes a differnt item to have a strict constraint/required fire, that other item display an error message with a different background color. That error cannot be suppressed by adding queries. While a strict constraint/required error is active, the user is prevented from navigating forward in the form or using the Close/Complete button.

### Multiple constraints
Support for multiple constraints to be added shortly.
Separate constraint logic can be addd (each with its own constraint message). These additional constraints cannot be defined as strict. The goal is to allow distinct constraint messages for each constraint condition.
Longer term, we are also planning to link different query threads for an item to each constraint. This would allow the system to automatically reopen an existing query thread if needed if the constraint related to that thread fires again in the future. Eventually, it would also allow for individual query threads to be auto-closed if the specific constraint logic is no longer firing.

### User confirmation before deleting a repeat

### Required '*' visibility 

### API

This fork is using an alternative API (/oc/api/v1) that returns the specific 'fieldsubmission' and headless views without interfering with the standard Enketo webform views. See [add link to doc].

### Fieldsubmissions

Whenever an individual field changes a submission of that field (XML fragment) is submitted. The whole XML record is never submitted. The server-side API (implemented in OC's backend is documented here [ add link]).


#### Close vs Complete


### Headless functionality

API endpoints were added that can process imported data headlessly, validate this and add auto queries to discrepancy note questions.

### Theme and styling

An OpenClinica theme was added that slightly tweaks the Formhub/Kobo themes. In addition several styling changes are made across themes, but primarily to deal with requirements of the customizations described in this document.

### Translations

A mechanism existing in the standard Enketo Express is used to add additional translation strings to the standard strings without augmenting the original files.

### IE11 and Edge Legacy

Internet Explorer and Edge Legacy are still supported.
Edge Legacy support will be dropped since it has gone to end of life.
