/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Copyright (c) Adam Voss. All rights reserved.
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_languageserver_1 = require("vscode-languageserver");
const request_light_1 = require("request-light");
const path = require("path");
const fs = require("fs");
const uri_1 = require("./languageService/utils/uri");
const URL = require("url");
const Strings = require("./languageService/utils/strings");
const vscode_yaml_languageservice_1 = require("vscode-yaml-languageservice");
const arrUtils_1 = require("./languageService/utils/arrUtils");
const yamlLanguageService_1 = require("./languageService/yamlLanguageService");
const nls = require("vscode-nls");
const jsonSchemaService_1 = require("./languageService/services/jsonSchemaService");
const yamlParser_1 = require("./languageService/parser/yamlParser");
nls.config(process.env['VSCODE_NLS_CONFIG']);
var SchemaAssociationNotification;
(function (SchemaAssociationNotification) {
    SchemaAssociationNotification.type = new vscode_languageserver_1.NotificationType('json/schemaAssociations');
})(SchemaAssociationNotification || (SchemaAssociationNotification = {}));
var VSCodeContentRequest;
(function (VSCodeContentRequest) {
    VSCodeContentRequest.type = new vscode_languageserver_1.RequestType('vscode/content');
})(VSCodeContentRequest || (VSCodeContentRequest = {}));
var ColorSymbolRequest;
(function (ColorSymbolRequest) {
    ColorSymbolRequest.type = new vscode_languageserver_1.RequestType('json/colorSymbols');
})(ColorSymbolRequest || (ColorSymbolRequest = {}));
// Create a connection for the server.
let connection = null;
if (process.argv.indexOf('--stdio') == -1) {
    connection = vscode_languageserver_1.createConnection(vscode_languageserver_1.ProposedFeatures.all);
}
else {
    connection = vscode_languageserver_1.createConnection();
}
console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);
// Create a simple text document manager. The text document manager
// supports full document sync only
let documents = new vscode_languageserver_1.TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);
let clientSnippetSupport = false;
let clientDynamicRegisterSupport = false;
let hasWorkspaceFolderCapability = false;
// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities.
let capabilities;
let workspaceFolders = [];
let workspaceRoot;
connection.onInitialize((params) => {
    capabilities = params.capabilities;
    workspaceFolders = params["workspaceFolders"];
    workspaceRoot = uri_1.default.parse(params.rootPath);
    function hasClientCapability(...keys) {
        let c = params.capabilities;
        for (let i = 0; c && i < keys.length; i++) {
            c = c[keys[i]];
        }
        return !!c;
    }
    hasWorkspaceFolderCapability = capabilities.workspace && !!capabilities.workspace.workspaceFolders;
    clientSnippetSupport = hasClientCapability('textDocument', 'completion', 'completionItem', 'snippetSupport');
    clientDynamicRegisterSupport = hasClientCapability('workspace', 'symbol', 'dynamicRegistration');
    return {
        capabilities: {
            textDocumentSync: documents.syncKind,
            completionProvider: { resolveProvider: true },
            hoverProvider: true,
            documentSymbolProvider: true,
            documentFormattingProvider: false
        }
    };
});
let workspaceContext = {
    resolveRelativePath: (relativePath, resource) => {
        return URL.resolve(resource, relativePath);
    }
};
let schemaRequestService = (uri) => {
    //For the case when we are multi root and specify a workspace location
    if (hasWorkspaceFolderCapability) {
        for (let folder in workspaceFolders) {
            let currFolder = workspaceFolders[folder];
            let currFolderUri = currFolder["uri"];
            let currFolderName = currFolder["name"];
            let isUriRegex = new RegExp('^(?:[a-z]+:)?//', 'i');
            if (uri.indexOf(currFolderName) !== -1 && !uri.match(isUriRegex)) {
                let beforeFolderName = currFolderUri.split(currFolderName)[0];
                let uriSplit = uri.split(currFolderName);
                uriSplit.shift();
                let afterFolderName = uriSplit.join(currFolderName);
                uri = beforeFolderName + currFolderName + afterFolderName;
            }
        }
    }
    if (Strings.startsWith(uri, 'file://')) {
        let fsPath = uri_1.default.parse(uri).fsPath;
        return new Promise((c, e) => {
            fs.readFile(fsPath, 'UTF-8', (err, result) => {
                err ? e('') : c(result.toString());
            });
        });
    }
    else if (Strings.startsWith(uri, 'vscode://')) {
        return connection.sendRequest(VSCodeContentRequest.type, uri).then(responseText => {
            return responseText;
        }, error => {
            return error.message;
        });
    }
    if (uri.indexOf('//schema.management.azure.com/') !== -1) {
        connection.telemetry.logEvent({
            key: 'json.schema',
            value: {
                schemaURL: uri
            }
        });
    }
    let headers = { 'Accept-Encoding': 'gzip, deflate' };
    return request_light_1.xhr({ url: uri, followRedirects: 5, headers }).then(response => {
        return response.responseText;
    }, (error) => {
        return Promise.reject(error.responseText || request_light_1.getErrorStatusDescription(error.status) || error.toString());
    });
};
// create the YAML language service
exports.languageService = vscode_yaml_languageservice_1.getLanguageService({
    schemaRequestService,
    workspaceContext,
    contributions: []
});
exports.KUBERNETES_SCHEMA_URL = "http://central.maven.org/maven2/io/fabric8/kubernetes-model/2.0.0/kubernetes-model-2.0.0-schema.json";
exports.KEDGE_SCHEMA_URL = "https://github.com/kedgeproject/json-schema/raw/master/master/controllers/deploymentspecmod.json";
exports.customLanguageService = yamlLanguageService_1.getLanguageService(schemaRequestService, workspaceContext, []);
let yamlConfigurationSettings = void 0;
let schemaAssociations = void 0;
let formatterRegistration = null;
let specificValidatorPaths = [];
let schemaConfigurationSettings = [];
let yamlShouldValidate = true;
let schemaStoreSettings = [];
connection.onDidChangeConfiguration((change) => {
    var settings = change.settings;
    request_light_1.configure(settings.http && settings.http.proxy, settings.http && settings.http.proxyStrictSSL);
    specificValidatorPaths = [];
    yamlConfigurationSettings = settings.yaml && settings.yaml.schemas;
    yamlShouldValidate = settings.yaml && settings.yaml.validate;
    schemaConfigurationSettings = [];
    for (let url in yamlConfigurationSettings) {
        let globPattern = yamlConfigurationSettings[url];
        let schemaObj = {
            "fileMatch": Array.isArray(globPattern) ? globPattern : [globPattern],
            "url": url
        };
        schemaConfigurationSettings.push(schemaObj);
    }
    setSchemaStoreSettingsIfNotSet();
    updateConfiguration();
    // dynamically enable & disable the formatter
    if (clientDynamicRegisterSupport) {
        let enableFormatter = settings && settings.yaml && settings.yaml.format && settings.yaml.format.enable;
        if (enableFormatter) {
            if (!formatterRegistration) {
                formatterRegistration = connection.client.register(vscode_languageserver_1.DocumentFormattingRequest.type, { documentSelector: [{ language: 'yaml' }] });
            }
        }
        else if (formatterRegistration) {
            formatterRegistration.then(r => r.dispose());
            formatterRegistration = null;
        }
    }
});
function setSchemaStoreSettingsIfNotSet() {
    if (schemaStoreSettings.length === 0) {
        getSchemaStoreMatchingSchemas().then(schemaStore => {
            schemaStoreSettings = schemaStore.schemas;
            updateConfiguration();
        });
    }
}
function getSchemaStoreMatchingSchemas() {
    return request_light_1.xhr({ url: "http://schemastore.org/api/json/catalog.json" }).then(response => {
        let languageSettings = {
            schemas: []
        };
        let schemas = JSON.parse(response.responseText);
        for (let schemaIndex in schemas.schemas) {
            let schema = schemas.schemas[schemaIndex];
            if (schema && schema.fileMatch) {
                for (let fileMatch in schema.fileMatch) {
                    let currFileMatch = schema.fileMatch[fileMatch];
                    if (currFileMatch.indexOf('.yml') !== -1 || currFileMatch.indexOf('.yaml') !== -1) {
                        languageSettings.schemas.push({ uri: schema.url, fileMatch: [currFileMatch] });
                    }
                }
            }
        }
        return languageSettings;
    }, (error) => {
        throw error;
    });
}
connection.onNotification(SchemaAssociationNotification.type, associations => {
    schemaAssociations = associations;
    specificValidatorPaths = [];
    setSchemaStoreSettingsIfNotSet();
    updateConfiguration();
});
function updateConfiguration() {
    let languageSettings = {
        validate: yamlShouldValidate,
        schemas: []
    };
    if (schemaAssociations) {
        for (var pattern in schemaAssociations) {
            let association = schemaAssociations[pattern];
            if (Array.isArray(association)) {
                association.forEach(uri => {
                    languageSettings = configureSchemas(uri, [pattern], null, languageSettings);
                });
            }
        }
    }
    if (schemaConfigurationSettings) {
        schemaConfigurationSettings.forEach(schema => {
            let uri = schema.url;
            if (!uri && schema.schema) {
                uri = schema.schema.id;
            }
            if (!uri && schema.fileMatch) {
                uri = 'vscode://schemas/custom/' + encodeURIComponent(schema.fileMatch.join('&'));
            }
            if (uri) {
                if (uri[0] === '.' && workspaceRoot && !hasWorkspaceFolderCapability) {
                    // workspace relative path
                    uri = uri_1.default.file(path.normalize(path.join(workspaceRoot.fsPath, uri))).toString();
                }
                languageSettings = configureSchemas(uri, schema.fileMatch, schema.schema, languageSettings);
            }
        });
    }
    if (schemaStoreSettings) {
        languageSettings.schemas = languageSettings.schemas.concat(schemaStoreSettings);
    }
    exports.languageService.configure(languageSettings);
    exports.customLanguageService.configure(languageSettings);
    // Revalidate any open text documents
    documents.all().forEach(triggerValidation);
}
function configureSchemas(uri, fileMatch, schema, languageSettings) {
    if (uri.toLowerCase().trim() === "kubernetes") {
        uri = exports.KUBERNETES_SCHEMA_URL;
    }
    if (uri.toLowerCase().trim() === "kedge") {
        uri = exports.KEDGE_SCHEMA_URL;
    }
    if (schema === null) {
        languageSettings.schemas.push({ uri, fileMatch: fileMatch });
    }
    else {
        languageSettings.schemas.push({ uri, fileMatch: fileMatch, schema: schema });
    }
    if (fileMatch.constructor === Array && uri === exports.KUBERNETES_SCHEMA_URL) {
        fileMatch.forEach((url) => {
            specificValidatorPaths.push(url);
        });
    }
    else if (uri === exports.KUBERNETES_SCHEMA_URL) {
        specificValidatorPaths.push(fileMatch);
    }
    return languageSettings;
}
documents.onDidChangeContent((change) => {
    triggerValidation(change.document);
});
documents.onDidClose(event => {
    cleanPendingValidation(event.document);
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});
let pendingValidationRequests = {};
const validationDelayMs = 200;
function cleanPendingValidation(textDocument) {
    let request = pendingValidationRequests[textDocument.uri];
    if (request) {
        clearTimeout(request);
        delete pendingValidationRequests[textDocument.uri];
    }
}
function triggerValidation(textDocument) {
    cleanPendingValidation(textDocument);
    pendingValidationRequests[textDocument.uri] = setTimeout(() => {
        delete pendingValidationRequests[textDocument.uri];
        validateTextDocument(textDocument);
    }, validationDelayMs);
}
function validateTextDocument(textDocument) {
    if (textDocument.getText().length === 0) {
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
        return;
    }
    let yamlDocument = yamlParser_1.parse(textDocument.getText());
    let isKubernetesFile = isKubernetes(textDocument);
    exports.customLanguageService.doValidation(textDocument, yamlDocument, isKubernetesFile).then(function (diagnosticResults) {
        let diagnostics = [];
        for (let diagnosticItem in diagnosticResults) {
            diagnosticResults[diagnosticItem].severity = 1; //Convert all warnings to errors
            diagnostics.push(diagnosticResults[diagnosticItem]);
        }
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: arrUtils_1.removeDuplicatesObj(diagnostics) });
    }, function (error) { });
}
function isKubernetes(textDocument) {
    for (let path in specificValidatorPaths) {
        let globPath = specificValidatorPaths[path];
        let fpa = new jsonSchemaService_1.FilePatternAssociation(globPath);
        if (fpa.matchesPattern(textDocument.uri)) {
            return true;
        }
    }
    return false;
}
connection.onDidChangeWatchedFiles((change) => {
    // Monitored files have changed in VSCode
    let hasChanges = false;
    change.changes.forEach(c => {
        if (exports.customLanguageService.resetSchema(c.uri)) {
            hasChanges = true;
        }
    });
    if (hasChanges) {
        documents.all().forEach(validateTextDocument);
    }
});
connection.onCompletion(textDocumentPosition => {
    let textDocument = documents.get(textDocumentPosition.textDocument.uri);
    let isKubernetesFile = isKubernetes(textDocument);
    let completionFix = completionHelper(textDocument, textDocumentPosition.position);
    let newText = completionFix.newText;
    let jsonDocument = yamlParser_1.parse(newText);
    return exports.customLanguageService.doComplete(textDocument, textDocumentPosition.position, jsonDocument, isKubernetesFile);
});
function completionHelper(document, textDocumentPosition) {
    //Get the string we are looking at via a substring
    let linePos = textDocumentPosition.line;
    let position = textDocumentPosition;
    let lineOffset = arrUtils_1.getLineOffsets(document.getText());
    let start = lineOffset[linePos]; //Start of where the autocompletion is happening
    let end = 0; //End of where the autocompletion is happening
    if (lineOffset[linePos + 1]) {
        end = lineOffset[linePos + 1];
    }
    else {
        end = document.getText().length;
    }
    let textLine = document.getText().substring(start, end);
    //Check if the string we are looking at is a node
    if (textLine.indexOf(":") === -1) {
        //We need to add the ":" to load the nodes
        let newText = "";
        //This is for the empty line case
        let trimmedText = textLine.trim();
        if (trimmedText.length === 0 || (trimmedText.length === 1 && trimmedText[0] === '-')) {
            //Add a temp node that is in the document but we don't use at all.
            if (lineOffset[linePos + 1]) {
                newText = document.getText().substring(0, start + (textLine.length - 1)) + "holder:\r\n" + document.getText().substr(end + 2);
            }
            else {
                newText = document.getText().substring(0, start + (textLine.length)) + "holder:\r\n" + document.getText().substr(end + 2);
            }
            //For when missing semi colon case
        }
        else {
            //Add a semicolon to the end of the current line so we can validate the node
            if (lineOffset[linePos + 1]) {
                newText = document.getText().substring(0, start + (textLine.length - 1)) + ":\r\n" + document.getText().substr(end + 2);
            }
            else {
                newText = document.getText().substring(0, start + (textLine.length)) + ":\r\n" + document.getText().substr(end + 2);
            }
        }
        return {
            "newText": newText,
            "newPosition": textDocumentPosition
        };
    }
    else {
        //All the nodes are loaded
        position.character = position.character - 1;
        return {
            "newText": document.getText(),
            "newPosition": position
        };
    }
}
connection.onCompletionResolve(completionItem => {
    return exports.customLanguageService.doResolve(completionItem);
});
connection.onHover(textDocumentPositionParams => {
    let document = documents.get(textDocumentPositionParams.textDocument.uri);
    let jsonDocument = yamlParser_1.parse(document.getText());
    let isKubernetesFile = isKubernetes(textDocumentPositionParams.textDocument);
    return exports.customLanguageService.doHover(document, textDocumentPositionParams.position, jsonDocument, isKubernetesFile);
});
connection.onDocumentSymbol(documentSymbolParams => {
    let document = documents.get(documentSymbolParams.textDocument.uri);
    let jsonDocument = yamlParser_1.parse(document.getText());
    return exports.customLanguageService.findDocumentSymbols(document, jsonDocument);
});
connection.onDocumentFormatting(formatParams => {
    let document = documents.get(formatParams.textDocument.uri);
    return exports.languageService.format(document, formatParams.options);
});
connection.listen();
//# sourceMappingURL=server.js.map