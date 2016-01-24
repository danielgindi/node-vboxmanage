# vboxmanage.js

[![npm Version](https://badge.fury.io/js/vboxmanage.js.png)](https://npmjs.org/package/vboxmanage.js)

A wrapper for VirtualBox CLI with Promises,

## Includes:

* Full `stdout`/`stderr` output
* Possibility to run an "unimplemented" vboxmanage feature using the `.manage(...)` call
* Interfaces for many of the common features like starting/stopping a VM, taking snapshots, running and killing processes, moving/copying files between host and guest etc.
* Supports both Windows and Linux hosts and guests.

## Installation:

```
npm install --save vboxmanage.js
```

## Usage example:

```javascript

var VBox = require('vboxmanage.js');

VBox
  .startvm(['Ubuntu x64"])
  .then(function () {
    return VBox.execOnVm('Ubuntu x64', 'user', 'password', 'my-program', ['--my-argument', 'another argument']);
  })
  .then(function () {
    return VBox.mkdir('Ubuntu x64', 'user', 'password', '/var/usr/test', true /* recursive */);
  })
  .then(function () {
    return VBox.takeSnapshot('Ubuntu x64', 'my snapshot name');
  })
  .then(function () {
    return VBox.powerOff('Ubuntu x64');
  })
  .catch(function (err) {
    console.log(err);
  })

```

## Contributing

If you have anything to contribute, or functionality that you lack - you are more than welcome to participate in this!
If anyone wishes to contribute unit tests - that also would be great :-)

## Me
* Hi! I am Daniel Cohen Gindi. Or in short- Daniel.
* danielgindi@gmail.com is my email address.
* That's all you need to know.

## Help

If you want to buy me a beer, you are very welcome to
[![Donate](https://www.paypalobjects.com/en_US/i/btn/btn_donate_LG.gif)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=G6CELS3E997ZE)
 Thanks :-)

## License

All the code here is under MIT license. Which means you could do virtually anything with the code.
I will appreciate it very much if you keep an attribution where appropriate.

    The MIT License (MIT)

    Copyright (c) 2013 Daniel Cohen Gindi (danielgindi@gmail.com)

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.
