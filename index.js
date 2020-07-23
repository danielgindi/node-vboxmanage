'use strict';

const ChildProcess = require('child_process');
let vBoxManageBinary,
    escapeArg;

// Host operating system
if (/^win/.test(process.platform)) {

    // Path may not contain VBoxManage.exe but it provides this environment variable
    const vBoxInstallPath = process.env.VBOX_INSTALL_PATH || process.env.VBOX_MSI_INSTALL_PATH;

    if (vBoxInstallPath) {
        vBoxManageBinary = '"' + vBoxInstallPath.replace(/\\$/, '') + '\\VBoxManage.exe' + '"';
    } else {
        console.warn('VBOX_INSTALL_PATH or VBOX_MSI_INSTALL_PATH environment variable is not defined.');
        vBoxManageBinary = 'VBoxManage.exe';
    }

    escapeArg = arg => {
        if (!/\s|[\\"&]/.test(arg)) return arg;

        return '"' + arg.replace(/"/g, '"""') + '"';
    };

} else {
    vBoxManageBinary = 'vboxmanage';

    escapeArg = arg => {
        return arg.replace(/([ \t\\|;&"`$*])/g, '\\$1');
    };
}


const VBoxManage = {};

/**
 * Call a VBoxManage command
 * @param {[String]} command
 * @param {Object?} options
 * @returns {Promise<{stdout, stderr}>}
 */
VBoxManage.manage = function (command, options) {

    command = command || [];
    if (!Array.isArray(command)) {
        command =  /**@type string[]*/[command];
    }

    options = options || {};

    for (let i = 0; i < command.length; i++) {
        command[i] = escapeArg(command[i]);
    }

    for (const [option, value] of Object.entries(options)) {
        command.push('--' + option);

        if (value !== true) {
            command.push(escapeArg(value));
        }
    }

    if (VBoxManage.debug) {
        console.warn("$ VBoxManage " + command.join(" "));
    }

    return new Promise((resolve, reject) => {
        ChildProcess.exec(vBoxManageBinary + ' ' + command.join(' '), {}, (err, stdout, stderr) => {
            if (err) {
                err.stderr = stderr;
                return reject(err);
            }

            return resolve({stdout: stdout, stderr: stderr});
        });
    });
};

/**
 * @param {String} vmname
 * @param {String} propName
 * @returns {Promise.<String?>}
 */
VBoxManage.getProperty = function (vmname, propName) {
    return this
        .manage(['guestproperty', 'get', vmname, propName])
        .then(std => {

            let value = std.stdout.substr(std.stdout.indexOf(':') + 1).trim();
            if (value === 'No value set!') {
                value = undefined;
            }

            return value;
        });
};

/**
 * @param {String} vmname
 * @param {String} propName
 * @param {String} value
 * @param {Object?} options
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.setProperty = function (vmname, propName, value, options) {
    return this.manage(['guestproperty', 'set', vmname, propName, value], options);
};

/**
 * @param {String} vmname
 * @param {String} propName
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.deleteProperty = function (vmname, propName) {
    return this.manage(['guestproperty', 'delete', vmname, propName]);
};

/**
 * @param {String} vmname
 * @param {String} newName
 * @param {Object?} options
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.clone = function (vmname, newName, options) {

    options = options || {};
    options['name'] = newName;

    return this.manage(['clonevm', vmname], options);
};

/**
 * @param {String} vmname
 * @param {String} snapshot
 * @param {String} newName
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.cloneSnapshot = function (vmname, snapshot, newName) {
    return this.clone(vmname, newName, { 'snapshot': snapshot });
};

/**
 * @param {String} vmname
 * @param {String} snapshotName
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.takeSnapshot = function (vmname, snapshotName) {
    return this.manage(['snapshot', vmname, 'take', snapshotName]);
};

/**
 * @param {String} vmname
 * @param {String} snapshotName
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.restoreSnapshot = function (vmname, snapshotName) {
    return this.manage(['snapshot', vmname, 'restore', snapshotName]);
};

/**
 * @param {String} vmname
 * @returns {Promise.<Object>}
 */
VBoxManage.getInfo = function (vmname) {
    return this
        .manage(['showvminfo', vmname], { 'machinereadable': true })
        .then(std => {

            const info = {};

            for (const line of std.stdout.split("\n")) {

                if (line.length > 0) {

                    const splitPoint = line.indexOf('=');
                    let key = line.substr(0, splitPoint);
                    let value = line.substr(splitPoint + 1);

                    if (key[0] === '"' && key[key.length - 1] === '"') {
                        key = key.slice(1, -1);
                    }

                    if (value[0] === '"') {
                        value = value.substring(1, value.lastIndexOf('"'));
                    } else {
                        value = value.replace(/\s+$/, '');
                    }

                    info[key] = value;
                }

            }

            return info;
        });
};

/**
 * @param {String} vmname
 * @param {Number?} timeout=-1 - when to give up. Specify a negative number for "infinite"
 * @returns {Promise.<String>}
 */
VBoxManage.getIPAddress = function (vmname, timeout) {

    if (timeout == null) {
        timeout = -1;
    }

    const finishLine = Date.now() + timeout;
    const retryDuration = 1000;

    return this
        .getProperty(vmname, '/VirtualBox/GuestInfo/Net/0/V4/IP')
        .then(address => {

            //noinspection JSValidateTypes
            if (address !== undefined ||
                (timeout > -1 && Date.now() >= (finishLine - retryDuration))) {
                return address;
            }

            let t;

            return new Promise((resolve, reject) => {
                t = setTimeout(() => {

                    if (timeout > -1) {
                        timeout = finishLine - Date.now();
                    }

                    VBoxManage.getIPAddress(vmname, timeout)
                        .then(resolve)
                        .catch(reject);

                }, 1000);
            });

        });

};

/**
 * @param {String} vmname
 * @param {Object?} options
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.modify = function (vmname, options) {
    return this.manage(['modifyvm', vmname], options);
};

/**
 * @param {String} vmname
 * @returns {Promise.<Boolean>}
 */
VBoxManage.isRegistered = function (vmname) {
    return this
        .getInfo(vmname)
        .then(() => true)
        .catch(() => false)
};

/**
 * @param {String} ovfname
 * @param {Object?} options
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.import = function (ovfname, options) {
    return this.manage(['import', ovfname], options);
};

/**
 * @param {String} vmname
 * @param {Boolean?} gui=false Should it run with gui or headless mode?
 * @param {Object?} options
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.start = function (vmname, gui, options) {
    options = options || {};
    options['type'] = gui ? 'gui' : 'headless';
    return this.manage(['-nologo', 'startvm', vmname], options);
};

/**
 * @param {String} vmname
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.reset = function (vmname) {
    return this.manage(['controlvm', vmname, 'reset']);
};

/**
 * @param {String} vmname
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.resume = function (vmname) {
    return this.manage(['controlvm', vmname, 'resume']);
};

/**
 * @param {String} vmname
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.stopAndSaveState = function (vmname) {
    return this.manage(['controlvm', vmname, 'savestate']);
};

/**
 * @param {String} vmname
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.powerOff = function (vmname) {
    return this.manage(['controlvm', vmname, 'poweroff']);
};

/**
 * @param {String} vmname
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.acpiPowerButton = function (vmname) {
    return this.manage(['controlvm', vmname, 'acpipowerbutton']);
};

/**
 * @param {String} vmname
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.acpiSleepButton = function (vmname) {
    return this.manage(['controlvm', vmname, 'acpisleepbutton']);
};

/**
 * @param {String} vmname
 * @param {String|Array<String>} source
 * @param {String} dest
 * @param {Boolean=false} recursive
 * @param {String} username
 * @param {String} password
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.copyToVm = function (vmname, username, password, source, dest, recursive) {

    let args = ['guestcontrol', vmname, 'copyto'];

    if (username) {
        args.push('--username', '"' + username + '"');
    }

    if (password) {
        args.push('--password', '"' + password + '"');
    }

    if (recursive) {
        args.push('--recursive');
    }

    args.push('--target-directory', dest);

    args = args.concat(source);

    return this.manage(args);
};

/**
 * @param {String} vmname
 * @param {String|Array<String>} source
 * @param {String} dest
 * @param {Boolean=false} recursive
 * @param {String} username
 * @param {String} password
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.copyFromVm = function (vmname, username, password, source, dest, recursive) {

    let args = ['guestcontrol', vmname, 'copyfrom'];

    if (username) {
        args.push('--username', '"' + username + '"');
    }

    if (password) {
        args.push('--password', '"' + password + '"');
    }

    if (recursive) {
        args.push('--recursive');
    }

    args.push('--target-directory', dest);

    args = args.concat(source);

    return this.manage(args);
};

/**
 * @param {String} vmname
 * @param {String} path
 * @param {Boolean=false} parents
 * @param {String} username
 * @param {String} password
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.mkdir = function (vmname, username, password, path, parents) {

    const args = ['guestcontrol', vmname, 'mkdir'];

    if (username) {
        args.push('--username', '"' + username + '"');
    }

    if (password) {
        args.push('--password', '"' + password + '"');
    }

    if (parents) {
        args.push('--parents');
    }

    args.push(path);

    return this.manage(args);
};

/**
 * @param {String} vmname
 * @param {String} path
 * @param {Boolean=false} recursive
 * @param {String} username
 * @param {String} password
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.rmdir = function (vmname, username, password, path, recursive) {

    const args = ['guestcontrol', vmname, 'rmdir'];

    if (username) {
        args.push('--username', '"' + username + '"');
    }

    if (password) {
        args.push('--password', '"' + password + '"');
    }

    if (recursive) {
        args.push('--recursive');
    }

    args.push(path);

    return this.manage(args);
};

/**
 * @param {String} vmname
 * @param {String} path
 * @param {Boolean=false} force
 * @param {String} username
 * @param {String} password
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.removeFile = function (vmname, username, password, path, force) {

    const args = ['guestcontrol', vmname, 'removefile'];

    if (username) {
        args.push('--username', '"' + username + '"');
    }

    if (password) {
        args.push('--password', '"' + password + '"');
    }

    if (force) {
        args.push('--force');
    }

    args.push(path);

    return this.manage(args);
};

/**
 * @param {String} vmname
 * @param {String|Array<String>} source
 * @param {String} dest
 * @param {String} username
 * @param {String} password
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.mv = VBoxManage.move = function (vmname, username, password, source, dest) {

    let args = ['guestcontrol', vmname, 'mv'];

    if (username) {
        args.push('--username', '"' + username + '"');
    }

    if (password) {
        args.push('--password', '"' + password + '"');
    }

    args = args.concat(source);

    args.push(dest);

    return this.manage(args);
};

/**
 * @param {String} vmname
 * @param {String} path
 * @param {String} username
 * @param {String} password
 * @returns {Promise.<{exists: Boolean, isDirectory: Boolean, isFile: Boolean, isLink: Boolean}>}
 */
VBoxManage.stat = function (vmname, username, password, path) {

    const args = ['guestcontrol', vmname, 'stat'];

    if (username) {
        args.push('--username', '"' + username + '"');
    }

    if (password) {
        args.push('--password', '"' + password + '"');
    }

    args.push(path);

    return this.manage(args)
        .then(std => {
            if (/Is a directory$/g.test(std.stdout)) {
                return { exists: true, isDirectory: true, isFile: false, isLink: false };
            }
            if (/Is a file/g.test(std.stdout)) {
                return { exists: true, isDirectory: false, isFile: true, isLink: false };
            }
            if (/found, type unknown \([0-9]+\)/g.test(std.stdout)) {
                return { exists: true, isDirectory: false, isFile: false, isLink: true };
            }
            if (typeof std.stdout === 'string' && std.stdout.trim()) {
                return { exists: true, isDirectory: false, isFile: false, isLink: false };
            }

            return { exists: false, isDirectory: false, isFile: false, isLink: false };
        })
};

/**
 * @param {String} vmname
 * @param {String} cmd
 * @param {String} username
 * @param {String} password
 * @param {[?]?} params
 * @param {boolean} [async=false]
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.execOnVm = function (vmname, username, password, cmd, params, async) {

    return this
        .getInfo(vmname)
        .then(info => {

            const isWindows = /windows/i.test(info['ostype']);

            const args = ['guestcontrol', vmname];
            params = params || [];

            if (username) {
                args.push('--username', '"' + username + '"');
            }

            if (password) {
                args.push('--password', '"' + password + '"');
            }

            if (async) {
                args.push('start');
            } else {
                args.push('run');
            }

            if (isWindows) {
                args.push('--exe', 'cmd.exe', '--', /* arg0 */ 'cmd.exe', /* arg1 */ '/c');
            } else {
                args.push('--exe', '/bin/sh', '--', /* arg0 */ '/bin/sh', /* arg1 */ '-c');
            }

            args.push(cmd + ' ' + params.join(' '));

            return VBoxManage.manage(args);
        });
};

/**
 * @param {String} vmname
 * @param {String} taskName
 * @param {String} username
 * @param {String} password
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.killOnVm = function (vmname, username, password, taskName) {

    return this.getInfo(vmname)
        .then(info => {

            let path, params;

            const isWindows = /windows/i.test(info['ostype']);

            if (isWindows) {

                path = 'taskkill.exe';
                params = ['/f', '/im', taskName];

            } else {

                path = 'sudo';
                params = ['killall', taskName];
            }

            return VBoxManage.execOnVm(vmname, username, password, path, params);
        });
};

module.exports = VBoxManage;
