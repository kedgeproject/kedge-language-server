"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const vscode_languageserver_1 = require("vscode-languageserver");
const yamlLanguageService_1 = require("../src/languageService/yamlLanguageService");
const jsonSchemaService_1 = require("../src/languageService/services/jsonSchemaService");
const testHelper_1 = require("./testHelper");
const yamlParser_1 = require("../src/languageService/parser/yamlParser");
var assert = require('assert');
let languageService = yamlLanguageService_1.getLanguageService(testHelper_1.schemaRequestService, testHelper_1.workspaceContext, [], null);
let schemaService = new jsonSchemaService_1.JSONSchemaService(testHelper_1.schemaRequestService, testHelper_1.workspaceContext);
let uri = 'http://json.schemastore.org/composer';
let languageSettings = {
    schemas: []
};
let fileMatch = ["*.yml", "*.yaml"];
languageSettings.schemas.push({ uri, fileMatch: fileMatch });
languageService.configure(languageSettings);
suite("Hover Tests", () => {
    describe('Yaml Hover with composer schema', function () {
        describe('doComplete', function () {
            function setup(content) {
                return vscode_languageserver_1.TextDocument.create("file://~/Desktop/vscode-k8s/test.yaml", "yaml", 0, content);
            }
            function parseSetup(content, position) {
                let testTextDocument = setup(content);
                let jsonDocument = yamlParser_1.parse(testTextDocument.getText());
                return languageService.doHover(testTextDocument, testTextDocument.positionAt(position), jsonDocument, false);
            }
            it('Hover works on array nodes', (done) => {
                let content = "authors:\n  - name: Josh";
                let hover = parseSetup(content, 14);
                hover.then(function (result) {
                    assert.notEqual(result.contents.length, 0);
                }).then(done, done);
            });
            it('Hover works on array nodes 2', (done) => {
                let content = "authors:\n  - name: Josh\n  - email: jp";
                let hover = parseSetup(content, 28);
                hover.then(function (result) {
                    assert.notEqual(result.contents.length, 0);
                }).then(done, done);
            });
        });
    });
});
//# sourceMappingURL=hover2.test.js.map