﻿import * as assert from "assert";
import * as sinon from "sinon";
import Q = require("q");
import Promise = Q.Promise;
import * as codePush from "code-push";
import * as cli from "../definitions/cli";
import * as cmdexec from "../script/command-executor";

export class SdkStub {
    public addApp(name: string, description?: string): Promise<codePush.App> {
        return Q(<codePush.App>{
            description: description,
            id: "appId",
            name: name
        });
    }

    public addDeployment(appId: string, name: string, description?: string): Promise<codePush.Deployment> {
        return Q(<codePush.Deployment>{
            description: description,
            id: "deploymentId",
            name: name
        });
    }

    public getAccessKeys(): Promise<codePush.AccessKey[]> {
        return Q([<codePush.AccessKey>{
            id: "7",
            name: "8"
        }]);
    }

    public getApps(): Promise<codePush.App[]> {
        return Q([<codePush.App>{
            id: "1",
            name: "a"
        }, <codePush.App>{
            id: "2",
            name: "b"
        }]);
    }

    public getDeploymentKeys(appId: string, deploymentId: string): Promise<codePush.DeploymentKey[]> {
        return Q([<codePush.DeploymentKey>{
            id: "5",
            key: "6",
            name: "Primary"
        }]);
    }

    public getDeployments(appId: string): Promise<codePush.Deployment[]> {
        return Q([<codePush.Deployment>{
            id: "3",
            name: "Production"
        }, <codePush.Deployment>{
            id: "4",
            name: "Staging",
            description: "cde",
            package: {
                appVersion: "1.0.0",
                description: "fgh",
                label: "ghi",
                packageHash: "jkl",
                isMandatory: true,
                size: 10,
                blobUrl: "http://mno.pqr"
            }
        }]);
    }

    public removeAccessKey(accessKeyId: string): Promise<void> {
        return Q(<void>null);
    }

    public removeApp(appId: string): Promise<void> {
        return Q(<void>null);
    }

    public removeDeployment(appId: string, deployment: string): Promise<void> {
        return Q(<void>null);
    }

    public updateApp(app: codePush.App): Promise<void> {
        return Q(<void>null);
    }

    public updateDeployment(appId: string, deployment: codePush.Deployment): Promise<void> {
        return Q(<void>null);
    }
}

describe("CLI", () => {
    var log: Sinon.SinonStub;
    var sandbox: Sinon.SinonSandbox;
    var wasConfirmed = true;

    beforeEach((): void => {
        wasConfirmed = true;

        sandbox = sinon.sandbox.create();

        sandbox.stub(cmdexec, "confirm", (): Promise<boolean> => Q(wasConfirmed));
        log = sandbox.stub(cmdexec, "log", (message: string): void => { });
        sandbox.stub(cmdexec, "loginWithAccessToken", (): Promise<void> => Q(<void>null));

        cmdexec.sdk = <any>new SdkStub();
    });

    afterEach((): void => {
        sandbox.restore();
    });

    it("accessKeyList lists access key names and ID's", (done: MochaDone): void => {
        var command: cli.ICommand = {
            type: cli.CommandType.accessKeyList,
            format: "json"
        };

        cmdexec.execute(command)
            .done((): void => {
                sinon.assert.calledOnce(log);
                assert.equal(log.args[0].length, 1);

                var actual: string = log.args[0][0];
                var expected = "[{\"name\":\"8\",\"id\":\"7\"}]";

                assert.equal(actual, expected);
                done();
            });
    });

    it("accessKeyRemove removes access key", (done: MochaDone): void => {
        var command: cli.IAccessKeyRemoveCommand = {
            type: cli.CommandType.accessKeyRemove,
            accessKeyName: "8"
        };

        var removeAccessKey: Sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "removeAccessKey");

        cmdexec.execute(command)
            .done((): void => {
                sinon.assert.calledOnce(removeAccessKey);
                sinon.assert.calledWithExactly(removeAccessKey, "7");
                sinon.assert.calledOnce(log);
                sinon.assert.calledWithExactly(log, "Removed access key \"8\".");

                done();
            });
    });

    it("accessKeyRemove does not remove access key if cancelled", (done: MochaDone): void => {
        var command: cli.IAccessKeyRemoveCommand = {
            type: cli.CommandType.accessKeyRemove,
            accessKeyName: "8"
        };

        var removeAccessKey: Sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "removeAccessKey");

        wasConfirmed = false;

        cmdexec.execute(command)
            .done((): void => {
                sinon.assert.notCalled(removeAccessKey);
                sinon.assert.calledOnce(log);
                sinon.assert.calledWithExactly(log, "Remove cancelled.");

                done();
            });
    });

    it("appAdd reports new app name and ID", (done: MochaDone): void => {
        var command: cli.IAppAddCommand = {
            type: cli.CommandType.appAdd,
            appName: "a"
        };

        var addApp: Sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "addApp");

        cmdexec.execute(command)
            .done((): void => {
                sinon.assert.calledOnce(addApp);
                sinon.assert.calledOnce(log);
                sinon.assert.calledWithExactly(log, "Added app \"a\" with ID appId.");
                done();
            });
    });

    it("appList lists app names and ID's", (done: MochaDone): void => {
        var command: cli.ICommand = {
            type: cli.CommandType.appList,
            format: "json"
        };

        cmdexec.execute(command)
            .done((): void => {
                sinon.assert.calledOnce(log);
                assert.equal(log.args[0].length, 1);

                var actual: string = log.args[0][0];
                var expected = "[{\"name\":\"a\",\"id\":\"1\"},{\"name\":\"b\",\"id\":\"2\"}]";

                assert.equal(actual, expected);
                done();
            });
    });

    it("appRemove removes app", (done: MochaDone): void => {
        var command: cli.IAppRemoveCommand = {
            type: cli.CommandType.appRemove,
            appName: "a"
        };

        var removeApp: Sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "removeApp");

        cmdexec.execute(command)
            .done((): void => {
                sinon.assert.calledOnce(removeApp);
                sinon.assert.calledWithExactly(removeApp, "1");
                sinon.assert.calledOnce(log);
                sinon.assert.calledWithExactly(log, "Removed app \"a\".");

                done();
            });
    });

    it("appRemove does not remove app if cancelled", (done: MochaDone): void => {
        var command: cli.IAppRemoveCommand = {
            type: cli.CommandType.appRemove,
            appName: "a"
        };

        var removeApp: Sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "removeApp");

        wasConfirmed = false;

        cmdexec.execute(command)
            .done((): void => {
                sinon.assert.notCalled(removeApp);
                sinon.assert.calledOnce(log);
                sinon.assert.calledWithExactly(log, "Remove cancelled.");

                done();
            });
    });

    it("appRename renames app", (done: MochaDone): void => {
        var command: cli.IAppRenameCommand = {
            type: cli.CommandType.appRename,
            currentAppName: "a",
            newAppName: "c"
        };

        var updateApp: Sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "updateApp");

        cmdexec.execute(command)
            .done((): void => {
                sinon.assert.calledOnce(updateApp);
                sinon.assert.calledOnce(log);
                sinon.assert.calledWithExactly(log, "Renamed app \"a\" to \"c\".");

                done();
            });
    });

    it("deploymentAdd reports new app name and ID", (done: MochaDone): void => {
        var command: cli.IDeploymentAddCommand = {
            type: cli.CommandType.deploymentAdd,
            appName: "a",
            deploymentName: "b"
        };

        var addDeployment: Sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "addDeployment");

        cmdexec.execute(command)
            .done((): void => {
                sinon.assert.calledOnce(addDeployment);
                sinon.assert.calledOnce(log);
                sinon.assert.calledWithExactly(log, "Added deployment \"b\" with ID deploymentId to app \"a\".");
                done();
            });
    });

    it("deploymentKeyList lists deployment key names and ID's", (done: MochaDone): void => {
        var command: cli.IDeploymentKeyListCommand = {
            type: cli.CommandType.deploymentKeyList,
            appName: "a",
            deploymentName: "Production",
            format: "json"
        };

        cmdexec.execute(command)
            .done((): void => {
                sinon.assert.calledOnce(log);
                assert.equal(log.args[0].length, 1);

                var actual: string = log.args[0][0];
                var expected = "[{\"name\":\"Primary\",\"id\":\"5\",\"key\":\"6\"}]";

                assert.equal(actual, expected);
                done();
            });
    });

    it("deploymentList lists deployment names and ID's", (done: MochaDone): void => {
        var command: cli.IDeploymentListCommand = {
            type: cli.CommandType.deploymentList,
            appName: "a",
            format: "json"
        };

        cmdexec.execute(command)
            .done((): void => {
                sinon.assert.calledOnce(log);
                assert.equal(log.args[0].length, 1);

                var actual: string = log.args[0][0];
                var expected = "[{\"name\":\"Production\",\"id\":\"3\"},{\"name\":\"Staging\",\"id\":\"4\"}]";

                assert.equal(actual, expected);
                done();
            });
    });

    it("deploymentList -v lists deployment names, ID's, descriptions and package information", (done: MochaDone): void => {
        var command: cli.IDeploymentListCommand = {
            type: cli.CommandType.deploymentList,
            appName: "a",
            format: "json",
            verbose: true
        };

        cmdexec.execute(command)
            .done((): void => {
                sinon.assert.calledOnce(log);
                assert.equal(log.args[0].length, 1);

                var actual: string = log.args[0][0];
                var expected = "[{\"name\":\"Production\",\"id\":\"3\"},{\"name\":\"Staging\",\"id\":\"4\",\"description\":\"cde\",\"package\":{\"appVersion\":\"1.0.0\",\"isMandatory\":true,\"packageHash\":\"jkl\",\"description\":\"fgh\"}}]";

                assert.equal(actual, expected);
                done();
            });
    });

    it("deploymentRemove removes deployment", (done: MochaDone): void => {
        var command: cli.IDeploymentRemoveCommand = {
            type: cli.CommandType.deploymentRemove,
            appName: "a",
            deploymentName: "Staging"
        };

        var removeDeployment: Sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "removeDeployment");

        cmdexec.execute(command)
            .done((): void => {
                sinon.assert.calledOnce(removeDeployment);
                sinon.assert.calledWithExactly(removeDeployment, "1", "4");
                sinon.assert.calledOnce(log);
                sinon.assert.calledWithExactly(log, "Removed deployment \"Staging\" from app \"a\".");

                done();
            });
    });

    it("deploymentRemove does not remove deployment if cancelled", (done: MochaDone): void => {
        var command: cli.IDeploymentRemoveCommand = {
            type: cli.CommandType.deploymentRemove,
            appName: "a",
            deploymentName: "Staging"
        };

        var removeDeployment: Sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "removeDeployment");

        wasConfirmed = false;

        cmdexec.execute(command)
            .done((): void => {
                sinon.assert.notCalled(removeDeployment);
                sinon.assert.calledOnce(log);
                sinon.assert.calledWithExactly(log, "Remove cancelled.");

                done();
            });
    });

    it("deploymentRename renames deployment", (done: MochaDone): void => {
        var command: cli.IDeploymentRenameCommand = {
            type: cli.CommandType.deploymentRename,
            appName: "a",
            currentDeploymentName: "Staging",
            newDeploymentName: "c"
        };

        var updateDeployment: Sinon.SinonSpy = sandbox.spy(cmdexec.sdk, "updateDeployment");

        cmdexec.execute(command)
            .done((): void => {
                sinon.assert.calledOnce(updateDeployment);
                sinon.assert.calledOnce(log);
                sinon.assert.calledWithExactly(log, "Renamed deployment \"Staging\" to \"c\" for app \"a\".");

                done();
            });
    });
});