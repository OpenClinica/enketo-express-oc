# Customizations

This is an overview of the customizations that were made in this fork.

### Discrepancy Note Widget
Multi-threaded widget that builds upon Enketo's basic comment widget. The widget enables users to discuss data, add queries to individual questions and log varies events such as value changes. 

[add screenshot]

### Handling Non-relevant questions that have values


### Strict required and strict constraints
Two additional 'strict' required and constraint types were added.

### Multiple constraints
Support for multiple constraints to be added shortly.

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