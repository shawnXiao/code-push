﻿/// <reference path="../../definitions/generated/code-push.d.ts" />

import * as base64 from "base-64";
import * as chalk from "chalk";
import * as fs from "fs";
var opener = require("opener");
import * as os from "os";
import * as path from "path";
var prompt = require("prompt");
import * as Q from "q";
import * as recursiveFs from "recursive-fs";
import slash = require("slash");
import tryJSON = require("try-json");
var Table = require("cli-table");
import * as yazl from "yazl";
import wordwrap = require("wordwrap");

import * as cli from "../definitions/cli";
import { AccessKey, AccountManager, App, Deployment, DeploymentKey } from "code-push";
import Promise = Q.Promise;

var configFilePath: string = path.join(process.env.LOCALAPPDATA || process.env.HOME, ".code-push.config");

interface IConnectionInfo {
    accessKeyName: string;
    providerName: string;
    providerUniqueId: string;
    serverUrl: string;
}

interface IPackageFile {
    isTemporary: boolean;
    path: string;
}

// Exported variables for unit testing.
export var sdk: AccountManager;
export var log = (message: string): void => console.log(message);

export var loginWithAccessToken = (): Promise<void> => {
    if (!connectionInfo) {
        return Q.fcall(() => { throw new Error("You are not logged in."); });
    }

    sdk = new AccountManager(connectionInfo.serverUrl);

    var accessToken: string = base64.encode(JSON.stringify({ accessKeyName: connectionInfo.accessKeyName, providerName: connectionInfo.providerName, providerUniqueId: connectionInfo.providerUniqueId }));

    return sdk.loginWithAccessToken(accessToken);
}

export var confirm = (): Promise<boolean> => {
    return Promise<boolean>((resolve, reject, notify): void => {
        prompt.message = "";
        prompt.delimiter = "";

        prompt.start();

        prompt.get({
            properties: {
                response: {
                    default: "y",
                    description: chalk.cyan("Are you sure?  ")
                }
            }
        }, (err: any, result: any): void => {
            if (err) {
                reject(err);
            } else if (result.response === "y" || result.response === "Y") {
                resolve(true);
            } else {
                resolve(false);
            }
        });
    });
}

var connectionInfo: IConnectionInfo;

function accessKeyList(command: cli.IAccessKeyListCommand): Promise<void> {
    throwForInvalidOutputFormat(command.format);

    return sdk.getAccessKeys()
        .then((accessKeys: AccessKey[]): void => {
            printList(command.format, accessKeys);
        });
}

function accessKeyRemove(command: cli.IAccessKeyRemoveCommand): Promise<void> {
    return getAccessKeyId(command.accessKeyName)
        .then((accessKeyId: string): Promise<void> => {
            throwForInvalidAccessKeyId(accessKeyId, command.accessKeyName);

            return confirm()
                .then((wasConfirmed: boolean): Promise<void> => {
                    if (wasConfirmed) {
                        return sdk.removeAccessKey(accessKeyId)
                            .then((): void => {
                                log("Removed access key \"" + command.accessKeyName + "\".");
                            });
                    }

                    log("Remove cancelled.");
                });
        });
}

function appAdd(command: cli.IAppAddCommand): Promise<void> {
    return sdk.addApp(command.appName, /*description*/ null)
        .then((app: App): void => {
            log("Added app \"" + command.appName + "\" with ID " + app.id + ".");
        });
}

function appList(command: cli.IAppListCommand): Promise<void> {
    throwForInvalidOutputFormat(command.format);

    return sdk.getApps()
        .then((apps: App[]): void => {
            printList(command.format, apps);
        });
}

function appRemove(command: cli.IAppRemoveCommand): Promise<void> {
    return getAppId(command.appName)
        .then((appId: string): Promise<void> => {
            throwForInvalidAppId(appId, command.appName);

            return confirm()
                .then((wasConfirmed: boolean): Promise<void> => {
                    if (wasConfirmed) {
                        return sdk.removeApp(appId)
                            .then((): void => {
                                log("Removed app \"" + command.appName + "\".");
                            });
                    }

                    log("Remove cancelled.");
                });
        });
}

function appRename(command: cli.IAppRenameCommand): Promise<void> {
    return getApp(command.currentAppName)
        .then((app: App): Promise<void> => {
            throwForInvalidApp(app, command.currentAppName);

            app.name = command.newAppName;

            return sdk.updateApp(app);
        })
        .then((): void => {
            log("Renamed app \"" + command.currentAppName + "\" to \"" + command.newAppName + "\".");
        });
}

function deleteConnectionInfoCache(): void {
    try {
        fs.unlinkSync(configFilePath);

        log("Deleted configuration file at '" + configFilePath + "'.");
    } catch (ex) {
    }
}

function deploy(command: cli.IDeployCommand): Promise<void> {
    return getAppId(command.appName)
        .then((appId: string): Promise<void> => {
            throwForInvalidAppId(appId, command.appName);

            return getDeploymentId(appId, command.deploymentName)
                .then((deploymentId: string): Promise<void> => {
                    throwForInvalidDeploymentId(deploymentId, command.deploymentName, command.appName);

                    var filePath: string = command.package;
                    var getPackageFilePromise: Promise<IPackageFile>;

                    if (fs.lstatSync(filePath).isDirectory()) {
                        getPackageFilePromise = Promise<IPackageFile>((resolve: (file: IPackageFile) => void, reject: (reason: Error) => void): void => {
                            var directoryPath: string = filePath;

                            recursiveFs.readdirr(directoryPath, (error?: any, directories?: string[], files?: string[]): void => {
                                if (error) {
                                    reject(error);
                                    return;
                                }

                                var baseDirectoryPath = path.dirname(directoryPath);
                                var fileName: string = generateRandomFilename(15) + ".zip";
                                var zipFile = new yazl.ZipFile();
                                var writeStream: fs.WriteStream = fs.createWriteStream(fileName);

                                zipFile.outputStream.pipe(writeStream)
                                    .on("error", (error: Error): void => {
                                        reject(error);
                                    })
                                    .on("close", (): void => {
                                        filePath = path.join(process.cwd(), fileName);

                                        resolve({ isTemporary: true, path: filePath });
                                    });

                                for (var i = 0; i < directories.length; ++i) {
                                    var directory: string = directories[i];
                                    var relativePath: string = path.relative(baseDirectoryPath, directory);

                                    // yazl does not like backslash (\) in the metadata path.
                                    relativePath = slash(relativePath);
                                    
                                    zipFile.addEmptyDirectory(relativePath);
                                }

                                for (var i = 0; i < files.length; ++i) {
                                    var file: string = files[i];
                                    var relativePath: string = path.relative(baseDirectoryPath, file);

                                    // yazl does not like backslash (\) in the metadata path.
                                    relativePath = slash(relativePath);

                                    zipFile.addFile(file, relativePath);
                                }

                                zipFile.end();
                            });
                        });
                    } else {
                        getPackageFilePromise = Q({ isTemporary: false, path: filePath });
                    }

                    return getPackageFilePromise
                        .then((file: IPackageFile): Promise<void> => {
                            return sdk.addPackage(appId, deploymentId, file.path, command.description, /*label*/ null, command.minAppVersion, command.mandatory)
                                .then((): void => {
                                    log("Deployed package " + command.package + " to deployment \"" + command.deploymentName + "\" for app \"" + command.appName + "\".");

                                    if (file.isTemporary) {
                                        fs.unlinkSync(filePath);
                                    }
                                });
                        });
                });
        });
}

function deploymentAdd(command: cli.IDeploymentAddCommand): Promise<void> {
    return getAppId(command.appName)
        .then((appId: string): Promise<void> => {
            throwForInvalidAppId(appId, command.appName);

            return sdk.addDeployment(appId, command.deploymentName, /*description*/ null)
                .then((deployment: Deployment): void => {
                    log("Added deployment \"" + command.deploymentName + "\" with ID " + deployment.id + " to app \"" + command.appName + "\".");
                })
        })
}

function deploymentKeyList(command: cli.IDeploymentKeyListCommand): Promise<void> {
    throwForInvalidOutputFormat(command.format);

    return getAppId(command.appName)
        .then((appId: string): Promise<DeploymentKey[]> => {
            throwForInvalidAppId(appId, command.appName);

            return getDeploymentId(appId, command.deploymentName)
                .then((deploymentId: string): Promise<DeploymentKey[]> => {
                    throwForInvalidDeploymentId(deploymentId, command.deploymentName, command.appName);

                    return sdk.getDeploymentKeys(appId, deploymentId);
                });
        })
        .then((deploymentKeys: DeploymentKey[]): void => {
            printDeploymentKeyList(command.format, deploymentKeys);
        });
}

function deploymentList(command: cli.IDeploymentListCommand): Promise<void> {
    throwForInvalidOutputFormat(command.format);

    return getAppId(command.appName)
        .then((appId: string): Promise<Deployment[]> => {
            throwForInvalidAppId(appId, command.appName);

            return sdk.getDeployments(appId);
        })
        .then((deployments: Deployment[]): void => {
            printDeploymentList(command, deployments);
        });
}

function deploymentRemove(command: cli.IDeploymentRemoveCommand): Promise<void> {
    return getAppId(command.appName)
        .then((appId: string): Promise<void> => {
            throwForInvalidAppId(appId, command.appName);

            return getDeploymentId(appId, command.deploymentName)
                .then((deploymentId: string): Promise<void> => {
                    throwForInvalidDeploymentId(deploymentId, command.deploymentName, command.appName);

                    return confirm()
                        .then((wasConfirmed: boolean): Promise<void> => {
                            if (wasConfirmed) {
                                return sdk.removeDeployment(appId, deploymentId)
                                    .then((): void => {
                                        log("Removed deployment \"" + command.deploymentName + "\" from app \"" + command.appName + "\".");
                                    })
                            }

                            log("Remove cancelled.");
                        });
                });
        });
}

function deploymentRename(command: cli.IDeploymentRenameCommand): Promise<void> {
    return getAppId(command.appName)
        .then((appId: string): Promise<void> => {
            throwForInvalidAppId(appId, command.appName);

            return getDeployment(appId, command.currentDeploymentName)
                .then((deployment: Deployment): Promise<void> => {
                    throwForInvalidDeployment(deployment, command.currentDeploymentName, command.appName);

                    deployment.name = command.newDeploymentName;

                    return sdk.updateDeployment(appId, deployment);
                })
                .then((): void => {
                    log("Renamed deployment \"" + command.currentDeploymentName + "\" to \"" + command.newDeploymentName + "\" for app \"" + command.appName + "\".");
                });
        });
}

function deserializeConnectionInfo(): IConnectionInfo {
    var json: string;

    try {
        json = fs.readFileSync(configFilePath, { encoding: "utf8" });
    } catch (ex) {
        return;
    }

    return tryJSON(json);
}

export function execute(command: cli.ICommand): Promise<void> {
    connectionInfo = deserializeConnectionInfo();

    switch (command.type) {
        case cli.CommandType.login:
            return login(<cli.ILoginCommand>command);

        case cli.CommandType.logout:
            return logout();

        case cli.CommandType.register:
            return register(<cli.IRegisterCommand>command);
    }

    return loginWithAccessToken()
        .then((): Promise<void> => {
            switch (command.type) {
                case cli.CommandType.accessKeyList:
                    return accessKeyList(<cli.IAccessKeyListCommand>command);

                case cli.CommandType.accessKeyRemove:
                    return accessKeyRemove(<cli.IAccessKeyRemoveCommand>command);

                case cli.CommandType.appAdd:
                    return appAdd(<cli.IAppAddCommand>command);

                case cli.CommandType.appList:
                    return appList(<cli.IAppListCommand>command);

                case cli.CommandType.appRemove:
                    return appRemove(<cli.IAppRemoveCommand>command);

                case cli.CommandType.appRename:
                    return appRename(<cli.IAppRenameCommand>command);

                case cli.CommandType.deploy:
                    return deploy(<cli.IDeployCommand>command);

                case cli.CommandType.deploymentAdd:
                    return deploymentAdd(<cli.IDeploymentAddCommand>command);

                case cli.CommandType.deploymentKeyList:
                    return deploymentKeyList(<cli.IDeploymentKeyListCommand>command);

                case cli.CommandType.deploymentList:
                    return deploymentList(<cli.IDeploymentListCommand>command);

                case cli.CommandType.deploymentRemove:
                    return deploymentRemove(<cli.IDeploymentRemoveCommand>command);

                case cli.CommandType.deploymentRename:
                    return deploymentRename(<cli.IDeploymentRenameCommand>command);

                default:
                    // We should never see this message as invalid commands should be caught by the argument parser.
                    log("Invalid command:  " + JSON.stringify(command));
            }
        });
}

function generateRandomFilename(length: number): string {
    var filename: string = "";
    var validChar: string = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (var i = 0; i < length; i++) {
        filename += validChar.charAt(Math.floor(Math.random() * validChar.length));
    }

    return filename;
}

function getAccessKey(accessKeyName: string): Promise<AccessKey> {
    return sdk.getAccessKeys()
        .then((accessKeys: AccessKey[]): AccessKey => {
            for (var i = 0; i < accessKeys.length; ++i) {
                var accessKey: AccessKey = accessKeys[i];

                if (accessKey.name === accessKeyName) {
                    return accessKey;
                }
            }
        });
}

function getAccessKeyId(accessKeyName: string): Promise<string> {
    return getAccessKey(accessKeyName)
        .then((accessKey: AccessKey): string => {
            if (accessKey) {
                return accessKey.id;
            }

            return null;
        });
}

function getApp(appName: string): Promise<App> {
    return sdk.getApps()
        .then((apps: App[]): App => {
            for (var i = 0; i < apps.length; ++i) {
                var app: App = apps[i];

                if (app.name === appName) {
                    return app;
                }
            }
        });
}

function getAppId(appName: string): Promise<string> {
    return getApp(appName)
        .then((app: App): string => {
            if (app) {
                return app.id;
            }

            return null;
        });
}

function getDeployment(appId: string, deploymentName: string): Promise<Deployment> {
    return sdk.getDeployments(appId)
        .then((deployments: Deployment[]): Deployment => {
            for (var i = 0; i < deployments.length; ++i) {
                var deployment: Deployment = deployments[i];

                if (deployment.name === deploymentName) {
                    return deployment;
                }
            }
        });
}

function getDeploymentId(appId: string, deploymentName: string): Promise<string> {
    return getDeployment(appId, deploymentName)
        .then((deployment: Deployment): string => {
            if (deployment) {
                return deployment.id;
            }

            return null;
        });
}

function initiateExternalAuthenticationAsync(serverUrl: string, action: string): void {
    var message: string = "An internet browser will now launch to authenticate your identity.\r\n\r\n"
        + "After completing in-browser authentication, please enter your access token to log in or use [CTRL]+[C] to exit.";

    log(message);

    var url: string = serverUrl + "/auth/" + action;

    log("\r\nLaunching browser for " + url);

    opener(url);
}

function login(command: cli.ILoginCommand): Promise<void> {
    initiateExternalAuthenticationAsync(command.serverUrl, "login");

    return loginWithAccessTokenInternal(command.serverUrl);
}

function loginWithAccessTokenInternal(serverUrl: string): Promise<void> {
    return requestAccessToken()
        .then((accessToken: string): Promise<void> => {
            if (accessToken === null) {
                // The user has aborted the synchronous prompt (e.g.:  via [CTRL]+[C]).
                return;
            }

            if (!accessToken) {
                log("Invalid access token.");

                return;
            }

            sdk = new AccountManager(serverUrl);

            return sdk.loginWithAccessToken(accessToken)
                .then((): void => {
                    log("Log in successful.");

                    // The access token is valid.
                    serializeConnectionInfo(serverUrl, accessToken);
                });
        });
}

function logout(): Promise<void> {
    if (connectionInfo) {
        return loginWithAccessToken()
            .then((): Promise<string> => {
                return getAccessKeyId(connectionInfo.accessKeyName);
            })
            .then((accessKeyId: string): Promise<void> => {
                return sdk.removeAccessKey(accessKeyId);
            })
            .then((): Promise<void> => sdk.logout(), (): Promise<void> => sdk.logout())
            .then((): void => deleteConnectionInfoCache(), (): void => deleteConnectionInfoCache())
            .then((): void => {
                log("Log out successful.");
            });
    }

    return Q(<void>null);
}

function printDeploymentKeyList(format: string, deploymentKeys: DeploymentKey[]): void {
    if (format === "json") {
        var dataSource: any[] = [];

        deploymentKeys.forEach((deploymentKey: DeploymentKey): void => {
            dataSource.push({ "name": deploymentKey.name, "id": deploymentKey.id, "key": deploymentKey.key });
        });

        log(JSON.stringify(dataSource));
    } else if (format === "table") {
        printTable(["Name", "ID", "Key"], (dataSource: any[]): void => {
            deploymentKeys.forEach((deploymentKey: DeploymentKey): void => {
                dataSource.push([deploymentKey.name, deploymentKey.id, deploymentKey.key]);
            });
        });
    }
}

function printDeploymentList(command: cli.IDeploymentListCommand, deployments: Deployment[]): void {
    if (command.verbose) {
        if (command.format === "json") {
            var dataSource: any[] = [];
            deployments.forEach((deployment: Deployment) => {
                var strippedDeployment: any = { "name": deployment.name, "id": deployment.id };
                if (deployment.description) strippedDeployment["description"] = deployment.description;
                if (deployment.package) {
                    strippedDeployment["package"] = {
                        "appVersion": deployment.package.appVersion,
                        "isMandatory": deployment.package.isMandatory,
                        "packageHash": deployment.package.packageHash
                    };
                    if (deployment.package.description) strippedDeployment["package"]["description"] = deployment.package.description;
                }

                dataSource.push(strippedDeployment);
            });
            log(JSON.stringify(dataSource));
        } else if (command.format === "table") {
            printTable(["Name", "ID", "Deployment Description", "Package Metadata"],
                (dataSource: any[]): void => {
                    deployments.forEach((deployment: Deployment): void => {
                        var packageString: string = "";
                        if (deployment.package) {
                            packageString =
                            (deployment.package.description ? wordwrap(30)("Description: " + deployment.package.description) + "\n" : "") +
                            "Version: " + deployment.package.appVersion + "\n" +
                            "Mandatory: " + (deployment.package.isMandatory ? "Yes" : "No") + "\n" +
                            "Hash: " + deployment.package.packageHash;
                        }
                        dataSource.push([
                            deployment.name,
                            deployment.id,
                            deployment.description ? wordwrap(30)(deployment.description) : "",
                            packageString
                        ]);
                    });
                },
                true
            );
        }
    } else {
        printList(command.format, deployments);
    }
}

function printList<T extends { id: string; name: string; }>(format: string, items: T[]): void {
    if (format === "json") {
        var dataSource: any[] = [];

        items.forEach((item: T): void => {
            dataSource.push({ "name": item.name, "id": item.id });
        });

        log(JSON.stringify(dataSource));
    } else if (format === "table") {
        printTable(["Name", "ID"], (dataSource: any[]): void => {
            items.forEach((item: T): void => {
                dataSource.push([item.name, item.id]);
            });
        });
    }
}

function printTable(columnNames: string[], readData: (dataSource: any[]) => void, separateRows?: boolean): void {
    var table: any;

    if (separateRows) {
        table = new Table({
            head: columnNames,
            style: { head: ["cyan"] }
        });
    } else {
        table = new Table({
            chars: {
                "mid": "",
                "left-mid": "",
                "mid-mid": "",
                "right-mid": ""
            },
            head: columnNames,
            style: { head: ["cyan"] }
        });
    }

    readData(table);

    log(table.toString());
}

function register(command: cli.IRegisterCommand): Promise<void> {
    initiateExternalAuthenticationAsync(command.serverUrl, "register");

    return loginWithAccessTokenInternal(command.serverUrl);
}

function requestAccessToken(): Promise<string> {
    return Promise<string>((resolve, reject, notify): void => {
        prompt.message = "";
        prompt.delimiter = "";

        prompt.start();

        prompt.get({
            properties: {
                response: {
                    description: chalk.cyan("Enter your access token:  ")
                }
            }
        }, (err: any, result: any): void => {
            if (err) {
                resolve(null);
            } else {
                resolve(result.response.trim());
            }
        });
    });
}

function serializeConnectionInfo(serverUrl: string, accessToken: string): void {
    // The access token should have been validated already (i.e.:  logging in).
    var json: string = base64.decode(accessToken);
    var info: IConnectionInfo = JSON.parse(json);

    info.serverUrl = serverUrl;

    json = JSON.stringify(info);

    fs.writeFileSync(configFilePath, json, { encoding: "utf8" });

    log("Login token persisted to file '" + configFilePath + "'. Run 'code-push logout' to remove the file.");
}

function throwForInvalidAccessKeyId(accessKeyId: string, accessKeyName: string): void {
    if (!accessKeyId) {
        throw new Error("Access key \"" + accessKeyName + "\" does not exist.");
    }
}

function throwForInvalidApp(app: App, appName: string): void {
    if (!app) {
        throw new Error("App \"" + appName + "\" does not exist.");
    }
}

function throwForInvalidAppId(appId: string, appName: string): void {
    if (!appId) {
        throw new Error("App \"" + appName + "\" does not exist.");
    }
}

function throwForInvalidDeployment(deployment: Deployment, deploymentName: string, appName: string): void {
    if (!deployment) {
        throw new Error("Deployment \"" + deploymentName + "\" does not exist for app \"" + appName + "\".");
    }
}

function throwForInvalidDeploymentId(deploymentId: string, deploymentName: string, appName: string): void {
    if (!deploymentId) {
        throw new Error("Deployment \"" + deploymentName + "\" does not exist for app \"" + appName + "\".");
    }
}

function throwForInvalidOutputFormat(format: string): void {
    switch (format) {
        case "json":
        case "table":
            break;

        default:
            throw new Error("Invalid format:  " + format + ".");
    }
}