"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const vscode_languageserver_1 = require("vscode-languageserver");
const request_light_1 = require("request-light");
const Strings = require("../src/languageService/utils/strings");
const uri_1 = require("../src/languageService/utils/uri");
const URL = require("url");
const fs = require("fs");
var assert = require('assert');
var VSCodeContentRequest;
(function (VSCodeContentRequest) {
    VSCodeContentRequest.type = new vscode_languageserver_1.RequestType('vscode/content');
})(VSCodeContentRequest || (VSCodeContentRequest = {}));
const validationDelayMs = 250;
let pendingValidationRequests = {};
let validDocuments;
// Create a connection for the server.
let connection = null;
if (process.argv.indexOf('--stdio') == -1) {
    connection = vscode_languageserver_1.createConnection(new vscode_languageserver_1.IPCMessageReader(process), new vscode_languageserver_1.IPCMessageWriter(process));
}
else {
    connection = vscode_languageserver_1.createConnection();
}
// After the server has started the client sends an initialize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities.
let workspaceRoot;
connection.onInitialize((params) => {
    workspaceRoot = params.rootPath;
    return {
        capabilities: {
            // Tell the client that the server works in FULL text document sync mode
            textDocumentSync: vscode_languageserver_1.TextDocumentSyncKind.Full,
            // Tell the client that the server support code complete
            completionProvider: {
                resolveProvider: false
            }
        }
    };
});
exports.workspaceContext = {
    resolveRelativePath: (relativePath, resource) => {
        return URL.resolve(resource, relativePath);
    }
};
exports.schemaRequestService = (uri) => {
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
    return request_light_1.xhr({ url: uri, followRedirects: 5 }).then(response => {
        return response.responseText;
    }, (error) => {
        return Promise.reject(error.responseText || request_light_1.getErrorStatusDescription(error.status) || error.toString());
    });
};
//# sourceMappingURL=testHelper.js.map