## Advanced Comment Widgets

Advanced comments widgets enable adding and reading comments on a particular question. 

These widgets build upon the generic comment feature (TODO: add documentation for generic feature) and keeps the following characteristics:

- A comment is coded in XForms as if it's a question. It has it's own XML data node. This means that XPath can be used to add form logic that references this question, e.g. a dynamic "required" expression that specifies that a particular question is required unless it has a comment.
- The `for` attribute, in the _http://enketo.org/xforms_ namespace, is used on the `<bind>` element to point a comment node to a question node. 
- An appearance is used to instantiate the widget. Without this appearance the comment input would show up as a regular question.
- Optionally a namespace attribute could be added to the data node in the model in the XForm definition. Enketo will not use that information but it could be helpful to link user-entered data with a comment in the analysis.

The advanced comment widgets extend the generic comment feature by: populating the comment node with a stringified JSON data structure.

### Data Structure 

**TODO: Is this final? I could not find original document that outlined this and reverse-engineered the format from the code.**

```json
{
	"queries": [
		{ 
			"id": "",
			"date_time": "2016-09-01 15:01 -06:00",
			"comment": "This value seems impossible.",
			"status": "new",
			"assigned_to": "Maurice Moss (moss)",
			"notify": false
		}
	],
	"logs": [
		{
			"type": "comment",
			"assigned_to": "Ada Clare (aclare)",
			"date_time": "2016-04-22 14:44:20 -06:00",
			"comment": "This is an older comment.", 
			"status": "updated",
			"user": "Maurice Moss (moss)"
		},
		{ 
			"type": "audit",  
			"message": "Item data value updated from old_value to new_value.",  
			"date_time" : "2016-05-18 12:44:20 -06:00"
			"user" : "Jen Barber (jen)",
		}
	]
}

```

### Discrepancy Notes Widget

To add a discrepancy note to a widget, the following needs to be defined in the XLSForm/XForm:

#### add a question

Add a question of type string, optionally with appearance `multiline`, immediately after the question node it refers to (preferably).

#### Appearance 'dn'

Give this the appearance `dn`

#### Add http://enketo.org/xforms namespace.

In XLSForm on the settings sheet, add a column namespaces and populate this with `enk=http://enketo.org/xforms`

#### Add a bind::enk:for column

For each discrepancy note question, add a reference to the question node it refers to in the `bind::enk:for` column, e.g. `${a}`


#### XForm sample


