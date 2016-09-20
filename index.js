'use strict';

var
    child_process = require('child_process'),
    vBoxManageBinary,
    escapeArg;

// Host operating system
if (/^win/.test(process.platform)) {

    // Path may not contain VBoxManage.exe but it provides this environment variable
    var vBoxInstallPath = process.env.VBOX_INSTALL_PATH || process.env.VBOX_MSI_INSTALL_PATH;
    vBoxManageBinary = '"' + vBoxInstallPath.replace(/\\$/, '') + '\\VBoxManage.exe' + '"';

    escapeArg = function (arg) {
        if (!/\s|[\\"]]/.test(arg)) return arg;

        return '"' + arg.replace(/"/g, '"""') + '"';
    };

} else {
    vBoxManageBinary = 'vboxmanage';

    escapeArg = function (arg) {
        if (!/\s|[\\"]]/.test(arg)) return arg;

        return arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    };
}


var VBoxManage = {};

/**
 * Call a VBoxManage command
 * @param {[String]} command
 * @param {Object?} options
 * @returns {Promise<{stdout, stderr}>}
 */
VBoxManage.manage = function (command, options) {

    command = command || [];
    if (!(command instanceof Array)) {
        command = [command];
    }

    options = options || {};

    for (var i = 0; i < command.length; i++) {
        command[i] = escapeArg(command[i]);
    }

    Object.keys(options).forEach(function (option) {

        command.push('--' + option);
        var value = options[option];

        if (value !== true) {
            command.push(escapeArg(value));
        }

    });

    if (VBoxManage.debug) {
        console.warn("$ VBoxManage " + command.join(" "));
    }

    return new Promise(function (resolve, reject) {

        child_process.exec(vBoxManageBinary + ' ' + command.join(' '), {}, function (err, stdout, stderr) {

            if (err) {
                err.stderr = stderr;
                return reject(err);
            }

            return resolve({ stdout: stdout, stderr: stderr });

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
        .then(function (std) {

            var value = std.stdout.substr(std.stdout.indexOf(':') + 1).trim();
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
        .then(function (std) {

            var info = {};

            std.stdout.split("\n").forEach(function (line) {

                if (line.length > 0) {

                    var splitPoint = line.indexOf('=');
                    var key = line.substr(0, splitPoint);
                    var value = line.substr(splitPoint + 1);

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

            });

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

    var finishLine = Date.now() + timeout;
    var retryDuration = 1000;

    return this
        .getProperty(vmname, '/VirtualBox/GuestInfo/Net/0/V4/IP')
        .then(function (address) {

            //noinspection JSValidateTypes
            if (address !== undefined ||
                (timeout > -1 && Date.now() >= (finishLine - retryDuration))) {
                return address;
            }

            var t;

            return new Promise(function (resolve, reject) {

                t = setTimeout(function () {

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
        .then(function () {
            return true;
        })
        .catch(function () {
            return false;
        })
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
 * @param {String?} gui='headless' - 'headless' or 'gui'
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

    var args = ['guestcontrol', vmname, 'copyto'];

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

    var args = ['guestcontrol', vmname, 'copyfrom'];

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

    var args = ['guestcontrol', vmname, 'mkdir'];

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

    var args = ['guestcontrol', vmname, 'rmdir'];

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

    var args = ['guestcontrol', vmname, 'removefile'];

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

    var args = ['guestcontrol', vmname, 'mv'];

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

    var args = ['guestcontrol', vmname, 'stat'];

    if (username) {
        args.push('--username', '"' + username + '"');
    }

    if (password) {
        args.push('--password', '"' + password + '"');
    }

    args.push(path);

    return this.manage(args)
        .then(function (std) {
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
 * @returns {Promise.<{stdout, stderr}>}
 */
VBoxManage.execOnVm = function (vmname, username, password, cmd, params) {

    return this
        .getInfo(vmname)
        .then(function (info) {

            var isWindows = /windows/i.test(info['ostype']);

            var args = ['guestcontrol', vmname];
            params = params || [];

            if (username) {
                args.push('--username', '"' + username + '"');
            }

            if (password) {
                args.push('--password', '"' + password + '"');
            }

            args.push('run');

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
        .then(function (info) {

            var path, params;

            var isWindows = /windows/i.test(info['ostype']);

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
