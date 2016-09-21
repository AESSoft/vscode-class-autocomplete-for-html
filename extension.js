var vscode = require('vscode');
var htmlParser = require('htmlparser2');
var cssParser = require('css');
var mode = 'production';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    toLog('Extension "aessoft-css-hint" is now active.');
    
    var subscriptions = [];
    var classes = [];

    var callback = function(event){
        // Reset classes array to start from fresh every time 
        classes = [];
        
        var activeEditor = vscode.window.activeTextEditor;
        var hrefs = [];
        var hrefsRemote = [];
        
        
        // Need an active editor to proceed
        if (activeEditor) {
            var activeDocument = activeEditor.document;
            var activeDocumentLanguage = activeDocument.languageId;
            toLog('Active file language: ' + activeDocumentLanguage);
            
            // Only care about html files
            if (activeDocumentLanguage.toLowerCase() === 'html') {
                vscode.window.setStatusBarMessage("Looking for stylesheets...");
                var activeDocumentFileName = activeDocument.fileName;
                var activeDocumentUri = activeDocument.uri;
                toLog('Active file name: ' + activeDocumentFileName);

                // HTML Parser configuration
                var parser = new htmlParser.Parser(
                    {
                        onopentag: function (name, attribs) {
                            // Only interested in links to stylesheets
                            if (name === "link") {
                                if (attribs["rel"] === "stylesheet") {
                                    toLog('Found link to a stylesheet: ' + attribs["href"]);
                                    
                                    // If found a local stylesheet push to hrefs
                                    if(attribs["href"].toLowerCase().indexOf('http') != 0){
                                        hrefs.push(attribs["href"]);
                                    }
                                    // If found a remote stylesheet push to hrefsRemote 
                                    else {
                                        hrefsRemote.push(attribs["href"]);
                                    }
                                }
                            }
                            //support to use html comment for css file reference,
                            //for instance, adding <!--../test.css--> into a html file, the test.css should be scaned                         
                            oncomment:function(data){                            
                                if(data.trim().toLowerCase().indexOf('.css') > 0){
                                    toLog('Found link to a stylesheet: ' + data.trim());                                
                                    hrefs.push(data.trim());
                                }
                            }
                        }
                    }, 
                    {
                        decodeEntities: true
                    }
                );

                // Parse content of active html file
                parser.write(activeDocument.getText().toString());
                parser.end();

                // Process discovered local css files if any
                if(hrefs.length > 0){
                    processCSSFiles(hrefs, activeDocumentUri);
                }
                else {
                    vscode.window.setStatusBarMessage("Active file does not link to any stylesheets...");
                }
                
            }
            else {
                // If not an html file display status and finish
                vscode.window.setStatusBarMessage("Waiting for an HTML file...");
            }
        }
    }

    function processCSSFiles(hrefs, activeDocumentUri) {
        // Container for text from all css files
        var mergedCSS = [];
        
        // Update status
        vscode.window.setStatusBarMessage("Found " + hrefs.length + " linked CSS file(s). Processing...");
        
        // Get reference path based on selected html file
        var activeDocumentUriStringStripped = activeDocumentUri.toString().substring(0, activeDocumentUri.toString().lastIndexOf("/") + 1);
        
        // Read content of each discovered css file
        hrefs.forEach(function (href, index) {
            var cssPath = href;
            // Create string containing a full path to the css file
            var cssUriString = activeDocumentUriStringStripped + cssPath;
            var cssUri = vscode.Uri.parse(cssUriString);

            var cssDocument = vscode.workspace.openTextDocument(cssUri)
                .then(function (textDocument) {
                    toLog('Loaded CSS file: ' + textDocument.uri.fsPath);
                    var cssFileContent = textDocument.getText().toString();
                    // If CSS add content to common container
                    if(textDocument.languageId.toLowerCase().toString() === 'css'){
                        if(cssFileContent.length > 0){
                            toLog('Pushing content to a merge array...');
                            mergedCSS.push(cssFileContent);
                        } else {
                            toLog('CSS file is empty...');
                        }
                    }
                    // If finished reading all css files then process merged content
                    if (hrefs.length == index + 1) {
                        if(mergedCSS.length > 0){
                            processMergedCSS(mergedCSS, classes);
                        } else {
                            toLog('Nothing to process. Merged array is empty...');
                            vscode.window.setStatusBarMessage("No content in linked CSS file(s)...");
                        }
                        
                    }
                }, function (error) {
                    vscode.window.setStatusBarMessage('Error while accessing CSS file. Use command palette \'Scan linked CSS files\' to try again... ')
                    toLog('Error occurred while reading CSS file: ' + error);
                });
        });
    }

    function processMergedCSS(mergedCSS, classes) {
        vscode.window.setStatusBarMessage('Extracting CSS classes...');
        toLog('Processing content from a merge array. Array size: ' + mergedCSS.length);

        mergedCSS.forEach(function(css, index) {
            try {
                var parsedCss = cssParser.parse(css);
                var selectors = [];

                // Get all rules and iterate
                parsedCss.stylesheet.rules.forEach(function(rule) {
                    // Only interested in rules of type rule or media
                    if (rule.type === 'rule'){
                        rule.selectors.forEach(function(selector) {
                            selectors.push(selector);
                            toLogVerbose('Found selector: ' + selector);
                        });
                    }
                    else if (rule.type === 'media'){
                        // Process rules inside media query 
                        rule.rules.forEach(function(rule) {
                            if (rule.type === 'rule'){
                                rule.selectors.forEach(function(selector) {
                                    selectors.push(selector);
                                    toLogVerbose('Found selector: ' + selector);
                                });
                            }
                        });
                    }

                    selectors.forEach(function(selector){
                        // Temporary container for classes inside current selector
                        var selectorClasses = [];
                        var regexMatch = null;
                        var regex = /[.]([\w-]+)/g;
                        

                        // Get matches if any and push to a temporary array
                        while (regexMatch = regex.exec(selector)) {
                            selectorClasses.push(regexMatch[1]);
                        }

                        // If temp array is not empty try adding classes to main class array
                        if (selectorClasses.length > 0) {
                            selectorClasses.forEach(function(classString) {
                                // Check if class does not already exists in the main class array and push if true
                                if (classes.indexOf(classString) === -1) {
                                    classes.push(classString);
                                    toLogVerbose('Pushed class: ' + classString);
                                }
                            });
                        }
                    });
                });
            } catch (e) {
                toLog('Exception occurred while parsing CSS: ' + e);
            }
        });
        vscode.window.setStatusBarMessage('Finished extracting CSS classes. (' + classes.length + ' classes found.)');
        toLog('Finished extracting CSS classes. (' + classes.length + ' classes found.)');
        return classes;
    }

    function toLog(message){
        if(mode.toLowerCase() === 'debug' || mode.toLowerCase() === 'verbose'){
            console.log(message);
        }
    }

    function toLogVerbose(message){
        if(mode.toLowerCase() === 'verbose'){
            console.log(message);
        }
    }

    callback(null);
    
    var listener = vscode.window.onDidChangeActiveTextEditor(callback,this,subscriptions);
    //var listener1 = vscode.workspace.onDidOpenTextDocument(callback, this, subscriptions);
    var listenerDisposable = vscode.Disposable.from.apply(vscode.Disposable, subscriptions);

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    var disposable = vscode.commands.registerCommand('extension.scanForCssClasses', function () {
        // The code you place here will be executed every time your command is executed
        callback(null);
    });

    var disposable2 = vscode.languages.registerCompletionItemProvider('html', {
        provideCompletionItems(document, position, token) {
            var start = new vscode.Position(position.line, 0);
            var range = new vscode.Range(start, position);
            var text = document.getText(range);

            // check if the cursor is on a class attribute and retrieve all the css rules in this class attribute
            var rawClasses = text.match(/class=["|']([\w- ]*$)/);
            if (rawClasses === null) {
                return [];
            }

            // will store the classes found on the class attribute
            var classesOnAttribute = [];
            // regex to extract the classes found of the class attribute
            var classesRegex = /[ ]*([\w-]*)[ ]*/g;

            var item = null;
            while ((item = classesRegex.exec(rawClasses[1])) !== null) {
                if (item.index === classesRegex.lastIndex) {
                    classesRegex.lastIndex++;
                }
                if (item !== null && item.length > 0) {
                    classesOnAttribute.push(item[1]);
                }
            }
            classesOnAttribute.pop();

            // creates a collection of CompletionItem based on the classes already fetched
            var completionItems = [];
            for (var i = 0; i < classes.length; i++) {
                completionItems.push(new vscode.CompletionItem(classes[i]));
            }

            // removes from the collection the classes already specified on the class attribute
            for (var i = 0; i < classesOnAttribute.length; i++) {
                for (var j = 0; j < completionItems.length; j++) {
                    if (completionItems[j].label === classesOnAttribute[i]) {
                        completionItems.splice(j, 1);
                    }
                }
            }

            return completionItems;
        },
        resolveCompletionItem(item, token) {
            return item;
        }
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push(disposable2);
    context.subscriptions.push(listenerDisposable);
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;
