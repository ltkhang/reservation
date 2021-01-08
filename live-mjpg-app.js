const WebSocket = require('ws');
const config = require('./config/config');
const JWT = require('./module/jwt');
const express = require('express');
const {base64encode, base64decode} = require('nodejs-base64');
const url = require('url');
const Core_Integrate = require('./module/core_integrate');
const fs = require('fs')
const util = require('util');
const app = express();
const port = config['port'];
const jwt = new JWT(config['secret']);
const core = new Core_Integrate(config);

// Init web api
app.set('json spaces', 200);
app.use(express.static('html'));
app.set('view engine', 'ejs');

app.get('/', function(req, res){
    res.json({AppName: 'Unicore Streamming'});
});

app.get('/get-token/:api_key', function(req, res){
    let cam_ids = req.query.cam_ids || null;
    if (!cam_ids){
        res.sendStatus(401); // Unauthorized
        return;
    }
    if (!util.isArray(cam_ids)){
        cam_ids = [cam_ids]
    }
    const api_key = req.params['api_key'];
    if (api_key == config['api-key']){
        let tokens = []
        for (let i = 0; i < cam_ids.length; i++){
            tokens.push(
                {
                    cam_id: cam_ids[i], 
                    token: base64encode(jwt.generate_token({cam_id: cam_ids[i]}, config['min-exp']))
                });
        }
        res.json(tokens);
    } else {
        res.sendStatus(401); // Unauthorized
    }
});


app.get('/:uuid_cam/frame.ejs', function (req, res) {
    const uuid_cam = req.params['uuid_cam'];
    res.render('frame', {uuid_cam: uuid_cam});
});

app.get('/:uuid_cam/s.jpg', function(req, res){
    const token = req.query.token || null;
    const uuid_cam = req.params['uuid_cam'];
/*   if (!token){
        res.sendStatus(401); // Unauthorized
        return;
    }
    const decoded_token = base64decode(decodeURIComponent(token));
    let decoded = jwt.verify_token(decoded_token);
    if (!decoded){
        res.sendStatus(401); // Unauthorized
        return;
    }
    if (decoded.data.cam_id !== uuid_cam){
        res.sendStatus(401); // Unauthorized
        return;
    }*/
    
    let emitter = core.set_emitter(uuid_cam); //core.eventEmitter;
    let boundary = 'unicore';
    let mimeType = 'image/jpeg';
    res.writeHead(200, {
        'Content-Type': `multipart/x-mixed-replace; boundary=${boundary}`,
        'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
        'Expires': 'Thu, Jan 01 1970 00:00:00 GMT',
        'Connection': 'keep-alive',
        'Pragma': 'no-cache'
        });
        var contentWriter,content = fs.readFileSync("stream/s.jpg", 'binary');
        res.write(`--${boundary}\r\n`);
        res.write(`Content-Type: ${mimeType}\r\n`);
        res.write(`Content-Length: ${content.length} \r\n`);
        res.write("\r\n");
        res.write(content,'binary');
        res.write("\r\n");

        emitter.on('data',contentWriter=function(data){
            content = data;
            res.write(`--${boundary}\r\n`);
            res.write(`Content-Type: ${mimeType}\r\n`);
            res.write(`Content-Length: ${content.length} \r\n`);
            res.write("\r\n");
            res.write(content,'binary');
            res.write("\r\n");
        })
        res.on('close', function () {
            emitter.removeListener('data',contentWriter);
            core.unset_emitter(emitter);
        });

});

app.listen(port, () => console.log(`App listening on port ${port}!`));

// Init websocket
const wss = new WebSocket.Server({ port: config['ws-port'] });

wss.on('connection', function connection(ws, req) {
    const {query: {cam_id, token}} = url.parse(req.url, true);
    if (!cam_id){
        ws.close();
        return;
    }
    console.log(cam_id)
    /*const decoded_token = base64decode(decodeURIComponent(token));
    let decoded = jwt.verify_token(decoded_token);
    if (!decoded){
        ws.close();
        return;
    }
    if (decoded.data.cam_id != cam_id){
        ws.close();
        return;
    }
    ws.cam_id = decoded.data.cam_id;*/
    ws.cam_id = cam_id;
    let emitter = core.set_emitter(cam_id);
    emitter.on('ws', recv_data=function(data){
        broadcast(ws.cam_id, JSON.stringify(data));
    });
    ws.on('message', function incoming(message) {
        console.log('received: %s, cam_id: %s', message, ws.cam_id);
    });

    ws.on('close', function close(){
        console.log('WS close %s', ws.cam_id);
        emitter.removeListener('ws',recv_data);
        core.unset_emitter(emitter);
    });
});

function broadcast(cam_id, data){
    wss.clients.forEach(function each(client) {
        if (client.cam_id == cam_id && client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
    });
}
