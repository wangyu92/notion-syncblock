/* eslint-disable @typescript-eslint/naming-convention */
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as https from 'https';
import { URL } from 'url';

// - Constants
const API_HOSTNAME = 'api.notion.com';
const API_VERSION = '2022-06-28';
const KEY_API_KEY = 'apiKey';

// - Global variables
let lastReceivedCodeBlack = {};

// - Utility functions
/**
 * 
 * @param context 
 * @param key 
 * @param value 
 */
function saveGlobal(context: { globalState: any; }, key: string, value: any) {
	let store = context.globalState;
	store.update(key, value);
}

/**
 * 
 * @param context 
 * @param key 
 * @returns 
 */
function getGlobal(context: { globalState: any; }, key: string) {
	let store = context.globalState;
	let value = store.get(key);
	return value;
}

/**
 * 
 * @param options 
 * @param callback 
 */
function requestHTTPS(options: string | https.RequestOptions | URL, callback: (arg0: string) => void) {
	const req = https.request(options, (res) => {
		console.log(`statusCode: ${res.statusCode}`);
		
		let data = '';
		res.on('data', (chunk) => {
			data += chunk;
		});

		res.on('end', () => {
			console.log(data);
			callback(data);
		});

		res.on('error', (error) => {
			console.error(error);
		});
	});

	req.end();
}

function requestHTTPSwithBody(options: string | https.RequestOptions | URL, body: string, callback: (arg0: string) => void) {
	const req = https.request(options, (res) => {
		console.log(`statusCode (withBody): ${res.statusCode}`);
		
		let data = '';
		res.on('data', (chunk) => {
			data += chunk;
		});

		res.on('end', () => {
			console.log(data);
			callback(data);
		});

		res.on('error', (error) => {
			console.error(error);
		});
	});

	req.write(body);
	req.end();
}

/**
 * 
 * @param context 
 * @returns 
 */
function syncBlock(context: vscode.ExtensionContext) {
	const editor = vscode.window.activeTextEditor;

	if (editor) {
		// - Get all text in editor
		const document = editor.document;
		const text = document.getText();

		// - Separate full text line by line
		const lines = text.split(/\r?\n/);

		// - Find Block ID
		const blockIdRegex = /Block ID: (.*)/;
		let blockId = '';
		const matched = lines[0].match(blockIdRegex);
		if (matched) {
			blockId = matched[1];
		}
		if (blockId.length === 0) {
			return;
		}

		// - Get API key
		let apiKey = getGlobal(context, KEY_API_KEY);
		if(apiKey === undefined) {
			vscode.window.showInformationMessage('Please input your Notion API key');
			return;
		}

		// - Get Notion Block
		const options = {
			hostname: `${API_HOSTNAME}`,
			port: 443,
			path: `/v1/blocks/${blockId}`,
			method: 'GET',
			headers: {
				'Notion-Version': `${API_VERSION}`,
				'Authorization': `Bearer ${apiKey}`,
			}
		};

		requestHTTPS(options, (data) => {
			let json = JSON.parse(data);

			lastReceivedCodeBlack = {
				"code": json.code
			};

			// - Get Content as plain text
			const typeName = json.type;
			let content = '';
			content = json[typeName]['rich_text'][0]['plain_text'];

			// - Prepare new text to replace
			let newText = lines[0] + '\n\n' + content;

			// - Replace text
			console.log(newText);
			console.log(text);
			if (newText !== text) {
				editor.edit(editBuilder => {
					editBuilder.replace(new vscode.Range(0, 0, document.lineCount, 0), newText);
				});
			}

			// Show message
			vscode.window.showInformationMessage('Synced!');
			
		});

	}
}

function uploadBlock(context: vscode.ExtensionContext) {
	const editor = vscode.window.activeTextEditor;

	if (editor) {
		// - Get all text in editor
		const document = editor.document;
		const text = document.getText();
		const lines = text.split(/\r?\n/);

		// - Get Block ID
		const blockIdRegex = /Block ID: (.*)/;
		let blockId = '';
		const matched = lines[0].match(blockIdRegex);
		if (matched) {
			blockId = matched[1];
		}
		if (blockId.length === 0) {
			return;
		}

		// - Remove first and second line
		const contentLines = lines.slice(2);
		let newText = contentLines.join('\n');

		// - Get API key
		const apiKey = getGlobal(context, KEY_API_KEY);

		// - Update Notion Block
		const options = {
			hostname: `${API_HOSTNAME}`,
			port: 443,
			path: `/v1/blocks/${blockId}`,
			method: 'PATCH',
			headers: {
				'Notion-Version': `${API_VERSION}`,
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			}
		};

		// - Prepare body
		const bodyDict = 
		{
			"code": {
				"rich_text": [{
					"text": {
					"content": `${newText}`
					}
				}]
			}
		};
		const body = JSON.stringify(bodyDict);
		console.log(body);

		requestHTTPSwithBody(options, body, (data) => {
			let json = JSON.parse(data);

			// - Get Content as plain text
			const typeName = json.type;
			let content = '';
			content = json[typeName]['rich_text'][0]['plain_text'];

			// - Prepare new text to replace
			let newText = lines[0] + '\n\n' + content;

			// - Replace text
			editor.edit(editBuilder => {
				// Show message and Dismiss
				vscode.window.showInformationMessage('Uploaded!');
			});
		});


	}
}

// -----------------------------------------------------------------------------
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// on activate
	const versionKey = 'shown.version';
	context.globalState.setKeysForSync([versionKey]);

	// Input API key
	vscode.commands.registerCommand('notion-sync.inputApiKey', () => {
		vscode.window.showInputBox({
			placeHolder: 'Input your Notion API key',
			ignoreFocusOut: true,
			validateInput: (text) => {
				if (text.length === 0) {
					return 'API key cannot be empty';
				}
				return null;
			}
		}).then((value) => {
			if (value) {
				vscode.window.showInformationMessage(`API key: ${value}`);
				
				// Save to User Settings
				saveGlobal(context, KEY_API_KEY, value);
			}
		});
	});

	// View API key
	vscode.commands.registerCommand('notion-sync.viewApiKey', () => {
		let apiKey = getGlobal(context, KEY_API_KEY);
		vscode.window.showInformationMessage(`API key: ${apiKey}`);
	});

	// Select Notion page
	vscode.commands.registerCommand('notion-sync.selectNotionPage', () => {
		
	});

	// Sync Notion Block
	vscode.commands.registerCommand('notion-sync.syncBlock', () => {
		syncBlock(context);
	});

	// Update
	vscode.commands.registerCommand('notion-sync.updateBlock', () => {
		uploadBlock(context);
	});

	// - Events
	vscode.window.onDidChangeWindowState(editor => {
		if (editor.focused) {
			syncBlock(context);
		}
	}, null, context.subscriptions);

	vscode.workspace.onWillSaveTextDocument(() => {
		uploadBlock(context);
	}, null, context.subscriptions);
}

// This method is called when your extension is deactivated
export function deactivate() {}
