const path = require('path');
const Mocha = require('mocha');

async function main() {
    const mocha = new Mocha({
        ui: 'bdd',
        color: true,
        timeout: 10000
    });

    mocha.addFile(path.join(__dirname, 'unit', 'errors.test.js'));
    mocha.addFile(path.join(__dirname, 'unit', 'router.test.js'));

    await new Promise((resolve) => {
        mocha.run((failures) => {
            if (failures > 0) {
                process.exitCode = 1;
            }
            resolve();
        });
    });
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
