const path = require('path');
const Mocha = require('mocha');
const glob = require('glob');

function run() {
    const mocha = new Mocha({
        ui: 'bdd',
        color: true
    });

    const testsRoot = path.resolve(__dirname, '..', 'integration');

    return new Promise((c, e) => {
        glob('**/*.test.js', { cwd: testsRoot }, (err, files) => {
            if (err) return e(err);

            files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

            try {
                mocha.run((failures) => {
                    if (failures > 0) {
                        e(new Error(`${failures} tests failed.`));
                    } else {
                        c();
                    }
                });
            } catch (err2) {
                e(err2);
            }
        });
    });
}

module.exports = { run };
