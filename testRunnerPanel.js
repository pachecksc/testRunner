
var layoutTestsServer = "http://localhost:8002/";
var scannerServer = "./";

var tests = [];
var skipList = [
    // HALT
    "inspector/console/console-api-on-call-frame.html",

    // FAILED
    "inspector/console/console-dir-global.html",
    "inspector/console/console-log-toString-object.html",
    "inspector/console/console-uncaught-exception-in-eval.html",
    "inspector/elements/edit-dom-actions.html",
    "inspector/elements/highlight-node-scaled.html",
    "inspector/elements/highlight-node-scroll.html",
    "inspector/elements/highlight-node.html",
    "inspector/elements/highlight-svg-root.html",
    "inspector/network-status-non-http.html",
    "inspector/storage-panel-dom-storage-update.html",
    "inspector/styles/inject-stylesheet.html",
    "inspector/styles/protocol-css-regions-commands.html",
    "inspector/styles/region-style-crash.html",
    "inspector/styles/styles-disable-then-enable-overriden-ua.html",
    "inspector/styles/styles-url-linkify.html",
    "inspector/styles/vendor-prefixes.html",
    "inspector/timeline/timeline-event-dispatch.html",
    "inspector/timeline/timeline-frames.html",
    "inspector/timeline/timeline-network-resource.html",
    "inspector/timeline/timeline-paint.html",
    "inspector/timeline/timeline-receive-response-event.html",

    // TIMEOUT
    "inspector/profiler/cpu-profiler-profiling-without-inspector.html",
    "inspector/profiler/heap-snapshot-inspect-dom-wrapper.html",
    "inspector/timeline/timeline-network-received-data.html",
];

var TestRunnerPanel = { 
    tests: []
};

TestRunnerPanel.loadTests = function loadTests() {
    document.getElementById("outline").removeChildren();
    TestRunnerPanel.treeOutline = new TreeOutline(document.getElementById("outline"));

    document.getElementById("pass").textContent = 0;
    document.getElementById("skip").textContent = 0;
    document.getElementById("fail").textContent = 0;
    document.getElementById("timeout").textContent = 0;
    document.getElementById("remaining").textContent  = 0;

    delete this.currentTestRunner;
    this.tests = [];

    if (window.testScannerIframe) 
        document.body.removeChild(window.testScannerIframe);
    window.testScannerIframe = document.createElement("iframe");
    window.testScannerIframe.src = scannerServer + "test-scanner.html";
    document.body.appendChild(window.testScannerIframe);
};

TestRunnerPanel.addTest = function(model) {
    var view = new TestView(model);
    this.tests.push({model: model, view: view});
    document.getElementById("remaining").textContent = this.tests.length;
}

TestRunnerPanel.run = function(debug)
{
    document.body.classList.remove('interrupted');

    this.runTests(debug);
};

TestRunnerPanel.runTests = function runTests(debug)
{
    this.debug = debug;
    this.runNextTest();
}

TestRunnerPanel.interrupt = function interrupt()
{
    document.body.classList.add('interrupted');
}

TestRunnerPanel.runNextTest = function runNextTest(lastResult)
{
    if (lastResult) {
        var element = document.getElementById(lastResult);
        element.textContent = parseInt(element.textContent) + 1;

        element = document.getElementById("remaining");
        element.textContent = '' + this.tests.length;
        if (window.debug) {
            document.getElementById("debug").textContent = "Debug";
            return;
        }
    }
    if (document.body.classList.contains('interrupted')) {
        return;
    }
    var test = this.tests.shift();
    if (test) {
      this.currentTestRunner = new TestRunner(test.model, test.view, runNextTest.bind(this));
      this.currentTestRunner.run(this.debug);  
    }
}

TestRunnerPanel.attachListeners = function attachListeners() {
    document.querySelector('.load').addEventListener('click', function(){
        TestRunnerPanel.loadTests();
    });document.querySelector('.run').addEventListener('click', function(){
        TestRunnerPanel.run();
    });
    document.querySelector('.debug').addEventListener('click', function(){
        TestRunnerPanel.run(true);
    });    
    document.querySelector('.interrupt').addEventListener('click', function(){
        TestRunnerPanel.interrupt();
    });
}

function TestModel(testCaseURL, expectedURL, expected, windowURL) {
    this.url = testCaseURL;
    this.expectedURL = expectedURL;
    this.expected = expected;
    this.windowURL = windowURL;
}

function TestView(testModel) {
    this._testModel = testModel;

    this._treeElement = new TreeElement(this._testModel.expectedURL);
    TestRunnerPanel.treeOutline.appendChild(this._treeElement);
    this._treeElement.onselect = this.onTreeElementSelect.bind(this);
}

TestView.prototype = {
    skipped: function() {  
       this._treeElement.title = this._testModel.expectedURL + ": SKIPPED"; 
    },

    onTreeElementSelect: function () 
    {
        var baseEndSentinel = '/inspector/';
        var baseChars = this._testModel.expectedURL.indexOf(baseEndSentinel) + baseEndSentinel.length;
        if (baseChars > 0) 
            document.getElementById("filter").value = this._testModel.expectedURL.substr(baseChars);
    },

    _showDiff: function(actual) {
        var baseLines = difflib.stringAsLines(this._testModel.expected);
        var newLines = difflib.stringAsLines(actual);
        var sm = new difflib.SequenceMatcher(baseLines, newLines);
        var opcodes = sm.get_opcodes();
        var lastWasSeparator = false;

        for (var idx = 0; idx < opcodes.length; idx++) {
            var code = opcodes[idx];
            var change = code[0];
            var b = code[1];
            var be = code[2];
            var n = code[3];
            var ne = code[4];
            var rowCount = Math.max(be - b, ne - n);
            var topRows = [];
            var bottomRows = [];
            for (var i = 0; i < rowCount; i++) {
                if (change === "delete" || (change === "replace" && b < be)) {
                    var lineNumber = b++;
                    this._treeElement.appendChild(new TreeElement("- [" + lineNumber + "] " + baseLines[lineNumber]));
                }

                if (change === "insert" || (change === "replace" && n < ne)) {
                    var lineNumber = n++;
                    this._treeElement.appendChild(new TreeElement("+ [" + lineNumber + "] " + newLines[lineNumber]));
                }

                if (change === "equal") {
                    b++;
                    n++;
                }
            }
        }
    },

    running: function() {
        this._treeElement.listItemElement.addStyleClass("running");
        console.log("begin "+this._testModel.expectedURL);
    },

    restyle: function(status) {
        this._treeElement.title = this._testModel.expectedURL + ": " + status.toUpperCase();
        this._treeElement.listItemElement.addStyleClass(status);
        console.log("end " + status + " "  + this._testModel.expectedURL);
        this.done = true;
        return status;
    },

    update: function(actual) {
        this._treeElement.listItemElement.removeStyleClass("running");
        if (this.done) {
            throw new Error("We're done already with "+this._testModel.expectedURL)
        }
        if (!actual) {
            return this.restyle('timedout');
        } else if (actual === this._testModel.expected || actual === this._testModel.expected + "\n") {
            return this.restyle('pass');
        } else {
            this._showDiff(actual);
            var link = new TreeElement('expected');
            link.onselect = function() {
                window.open(this._testModel.expectedURL);
            }.bind(this)
            this._treeElement.appendChild(link);
            return this.restyle('fail');
        }
    },
};

function TestRunner(testModel,  testView, next)
{
    this._testModel = testModel;
    this._testView = testView;
    this._next = next;

    this._pendingMessages = [];
    this._onMessageAdded = this._onMessageAdded.bind(this);
}

var SignalTokens = {
    COMPLETE: "InspectorTest.testComplete: ",
    RESULT: "InspectorTest.addResult: ",
    CLEAR: "InspectorTest.clearResults: ",
};

TestRunner.prototype = {

    run: function(debug)
    {
        if (!debug) {
            var skipMe = skipList.some(function(path){
                return (this._testModel.expectedURL.indexOf(path) !== -1);
            }.bind(this)) 

            if (skipMe) {
                this._testView.skipped();
                this._next("skip");
                return;
            }
        }

        this._testView.running();
        this._listenForResults();
        this._reloadWithTestScripts(debug);
    },

    _listenForResults: function() {
        chrome.experimental.devtools.console.onMessageAdded.addListener(this._onMessageAdded);
    },

    _onMessageAdded: function(message) {
        var mark = message.text.indexOf(SignalTokens.RESULT);
        if (mark !== -1) {
            this.actual = this.actual || "";
            this.actual += message.text.substring(mark + SignalTokens.RESULT.length) + '\n';
        } else {
          mark = message.text.indexOf(SignalTokens.COMPLETE);
          if (mark !== -1) {
            this.actual += '\n';
            this.notifyDone(this.actual);
          }
        }
    },

    _reloadWithTestScripts: function(debug) {
        // This function runs in the DevtoolsExtended window
        function runInEveryDebuggeeFrame(testURL, jsonSignalTokens) {
            (function(){
                // This first part runs in every frame, before any other code
                window.dispatchStandaloneTestRunnerMessages = true;
                window.SignalTokens = JSON.parse(jsonSignalTokens);
                if (window.location.href !== testURL) {
                    window.opener = true; // lie so InspectorFrontEndAPI listens for our messages
                } else {
                    // Runs only in test-script iframe
                    window.testRunner = { // impl API called by test suite running in the iframe
                        dumpAsText: function(){ },
                        waitUntilDone: function(){},
                        closeWebInspector: function() { },
                        notifyDone: function() { },
                        evaluateInWebInspector: function(callId, script) {
                            window.parent.postMessage(["evaluateForTest", callId, script], "*");
                            if (!window.sentActualHeader) {
                                window.sentActualHeader = true;
                                var actualHeader = 'InspectorTest.addResult(unescape(\"' + escape(document.body.innerText + '\n') + '\"))';
                                window.parent.postMessage(["evaluateForTest", 99, actualHeader],"*");
                            }
                        },
                        display: function() { }
                    };
                    // Called after InspectorTest is created, see inspector-test.js
                    // Runs in WebInspector window
                    window.initialize_monkeyPatchInspectorTest = function() {
                        InspectorTest.Output = {  
                            testComplete: function() 
                            {
                                WebInspector.consoleTrue.log(SignalTokens.COMPLETE, InspectorTest.completeTestCallId);
                            },
                            addResult: function(text) 
                            {
                                WebInspector.consoleTrue.log(SignalTokens.RESULT + text);
                            },
                            clearResults: function() 
                            {
                                WebInspector.consoleTrue.log(SignalTokens.CLEAR);
                            }
                        };
                    }
                }
                // Runs only in WebInspector window
                function monkeyPatch() {
                    WebInspector.evaluateForTestInFrontend = function(callId, script)
                    {
                        window.isUnderTest = true;
                        function invokeMethod()
                        {
                            try {
                                script = script + "//@ sourceURL=evaluateInWebInspector" + callId + ".js";
                                var result = window.eval(script);
                                var message = typeof result === "undefined" ? "\"<undefined>\"" : JSON.stringify(result);
                                WebInspector.consoleTrue.log("WebInspector eval result:", message)
                            } catch (e) {
                                WebInspector.consoleTrue.error("WebInspector eval error:" + e, e.stack);
                            }
                        }
                        InspectorBackend.runAfterPendingDispatches(invokeMethod);
                    };
                }    
                window.addEventListener('load', function checkForInspector(){
                    console.log('testRunner found load event in '+window.location);
                    if (window.WebInspector) {  // this part only runs in one frame and on load  
                        console.log('testRunner found WebInspector event in '+window.location);
                        
                        var iframe = document.createElement('iframe');
                        iframe.setAttribute('style', 'width:0;height:0;opacity:0');
                        document.body.appendChild(iframe);
                        window.opener = iframe.contentWindow; 

                        // TODO set this with an eval after we know the DevtoolsExtended has loaded extensions
                        WebInspector.notifications.addEventListener('InspectorLoaded', function () {
                            WebInspector.consoleTrue.log("InspectorLoaded");
                            // navigate the victim page to our testURL
                            var navigated = WebInspector.ResourceTreeModel.EventTypes.InspectedURLChanged;
                            function evaluateInConsole(code) {
                                WebInspector.consoleView.visible = true;
                                WebInspector.consoleView.prompt.text = code;
                                var event = document.createEvent("KeyboardEvent");
                                event.initKeyboardEvent("keydown", true, true, null, "Enter", "");
                                WebInspector.consoleView.prompt.proxyElement.dispatchEvent(event);
                            }
                            var webInspectorRequiredThis = {
                              onNavigated: function(event) {
                                var url = event.data;
                                WebInspector.consoleTrue.log("testRunner: page navigated to ", url);
                                if (url === testURL) {
                                    WebInspector.resourceTreeModel.removeEventListener(
                                        navigated, 
                                        webInspectorRequiredThis.onNavigated, 
                                        webInspectorRequiredThis
                                    );
                                    iframe.setAttribute('src', testURL);
                                    WebInspector.consoleTrue.log('testRunner set iframe to '+testURL);
                                } else {
                                    evaluateInConsole('window.location=\"' + testURL + '\"', "test");
                                    WebInspector.consoleTrue.log('testRunner repeat window.location to  ' + testURL);
                                }
                              }
                            }
                            // See ExtensionServer.js
                            WebInspector.resourceTreeModel.addEventListener(
                                navigated, 
                                webInspectorRequiredThis.onNavigated, 
                                webInspectorRequiredThis
                            );
                            evaluateInConsole('window.location=\"' + testURL + '\"', "test");
                            WebInspector.consoleTrue.log('testRunner window.location to  ' + testURL);
                        });

                       // save console since inspector-test.js will run in this window and overwrite our console.
                        window.WebInspector.consoleTrue = {
                            log: console.log.bind(console),
                            error: console.error.bind(console),
                            info: console.info.bind(console),
                        };
                        monkeyPatch();

                    } else {
                        // we are not in the iframe with the WebInspector, do nothing
                    }
                });
            }());
        }
        if (!debug)  {
            // No parameter to notifyDone signals timedout
            this._watchDog = setTimeout(this.notifyDone.bind(this), 10000);
        }
            
        var reloadOptions = {
            ignoreCache: true, 
            injectedScript:  '(' + runInEveryDebuggeeFrame + '(\"' + this._testModel.url + '\", \'' + JSON.stringify(SignalTokens) + '\')' +')',
          };
        chrome.devtools.inspectedWindow.reload(reloadOptions);
    },

    notifyDone: function(actual)
    {
        if (TestRunnerPanel.debugDiffs) console.log("actual", this.actual);
        chrome.experimental.devtools.console.onMessageAdded.removeListener(this._onMessageAdded); 
        clearTimeout(this._watchDog);   
        var pass = this._testView.update(this.actual);    
        this._next(pass);
    },
}

function onMessageFromTestScanner(event)
{
    var signature = event.data;
    if (!signature.shift) 
        return;
    var method = signature.shift();
    if (method === 'test') {
        var testData = signature[0];
        var model = new TestModel(testData.testCaseURL, testData.expectedURL, testData.expected, testData.windowURL);
        var filterText = document.getElementById("filter").value;
        var reFilter = filterText ? new RegExp(filterText) : null;
        if (reFilter) {
            if (!reFilter.test(model.expectedURL))
                return;
        }
        TestRunnerPanel.addTest(model);
    }
}
window.addEventListener("message", onMessageFromTestScanner, true);

function onload()
{
     TestRunnerPanel.attachListeners();

    var queryParamsObject = {};
    var queryParams = window.location.search;
    if (!queryParams)
        return;
    var params = queryParams.substring(1).split("&");
    for (var i = 0; i < params.length; ++i) {
        var pair = params[i].split("=");
        queryParamsObject[pair[0]] = pair[1];
    }
    if ("filter" in queryParamsObject)
        document.getElementById("filter").value = queryParamsObject["filter"];
}
window.addEventListener('load', onload);




