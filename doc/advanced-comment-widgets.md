## Advanced Comment Widgets

Advanced comments widgets enable adding and reading comments on a particular question. 

These widgets build upon the generic comment feature (TODO: add documentation for generic feature) and keeps the following characteristics:

- A comment is coded in XForms as if it's a question. It has it's own XML data node. This means that XPath can be used to add form logic that references this question, e.g. a dynamic "required" expression that specifies that a particular question is required unless it has a comment.
- The `for` attribute, in the _http://enketo.org/xforms_ namespace, is used on the `<bind>` element to point a comment node to a question node. 
- An appearance is used to instantiate the widget. Without this appearance the comment input would show up as a regular question.
- Optionally a namespace attribute could be added to the data node in the model in the XForm definition. Enketo will not use that information but it could be helpful to link user-entered data with a comment in the analysis.

The advanced comment widgets extend the generic comment feature by: populating the comment node with a stringified JSON data structure.

### Data Structure

```json


```

### Discrepancy Notes Widget



#### XForm sample


