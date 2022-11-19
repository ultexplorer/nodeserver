'use strict';

const http = require('node:http');
const cluster = require('node:cluster');
const os = require('node:os');

const PORT = 2000;

const user = { name:'ivan', age: 100 };
const pid = process.pid;

const routing = {
    '/': '<h1>Welcome to home page!<hr></h1>',
    '/user': user,
    '/user/name': () => user.name.toUpperCase(),
    '/user/age': () => user.age,
    '/api/method1': (req, res, callback) => {
        callback({status: res.statusCode});
    },
    '/user/*': (req, res, par, callback) => callback('user ' + par[0]),
    '/admin/*': (req, res, par, callback) => callback('admin ' + par[0]),
};

const types = {
    object: ([data], callback) => callback(JSON.stringify(data)),
    undefined: (args, callback) => callback('not found'),
    function: ([fn, req, res, par], callback) => {
        if (fn.length === 3) fn(req, res, callback);
        else if (fn.length === 4) fn(req, res, par, callback)
        else callback(JSON.stringify(fn(req, res)));
    },
};

const matching = [];
for (const key in routing) {
    if (key.includes('*')) {
        const rx = new RegExp(key.replace('*', '(.*)'));
        const data = routing[key];
        matching.push([rx, data]);
        delete routing[key];
    }
}


const serve = (data, req, res, par) => {
    const type = typeof data;
    if (type === 'string') {
        res.setHeader('Process-Id', pid);
        return res.end(data);
    }
    const serializer = types[type];
    serializer([data, req, res, par], data => serve(data, req, res, par));
};


const searchForData = (data, req, res, par) => {
    for (let i = 0; i < matching.length; i++) {
        const rx = matching[i];
        par = req.url.match(rx[0])
        if (par) {
            par.shift();
            data = rx[1]
            serve(data, req, res, par);
            break;
        }
    }
}

if(cluster.isMaster){
    const count = os.cpus().length;
    console.log(`Master pid: ${pid}`);
    console.log(`Starting ${count} forks`);
    for(let i = 0; i < count; i++) cluster.fork();
} else {
    const id = cluster.worker.id;
    console.log(`Worker: ${id}, pid: ${pid}, port: ${PORT}`);
    http.createServer((req, res) => {
        let data = routing[req.url];
        let par = null;
        if (!data) {
            searchForData(data, req, res, par);
            return;
        }
        serve(data, req, res, par);
    }).listen(PORT);
}


