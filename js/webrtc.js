// WebRTC PeerJS Connection Manager
// 提供手機與電腦零設定、免架後端的高速點對點連線

class HostPeerConnection {
    constructor(onDataCallback, onStatusCallback) {
        this.onData = onDataCallback;
        this.onStatus = onStatusCallback;
        this.peer = null;
        this.conn = null;
        this.roomId = null;
        this.init();
    }

    init() {
        const randCode = Math.floor(1000 + Math.random() * 9000);
        this.roomId = `scurve-${randCode}`;

        if (typeof Peer === 'undefined') {
            console.error('PeerJS not loaded');
            if (this.onStatus) this.onStatus('error', 'PeerJS 未載入');
            return;
        }

        try {
            this.peer = new Peer(this.roomId, { debug: 1 });

            this.peer.on('open', (id) => {
                console.log('Host Peer opened with ID:', id);
                if (this.onStatus) this.onStatus('ready', id);
            });

            this.peer.on('connection', (connection) => {
                this.conn = connection;
                console.log('Phone connected!');
                if (this.onStatus) this.onStatus('connected', this.conn.peer);

                this.conn.on('data', (data) => {
                    if (this.onData) this.onData(data);
                });

                this.conn.on('close', () => {
                    console.log('Phone disconnected');
                    if (this.onStatus) this.onStatus('disconnected');
                });
            });

            this.peer.on('error', (err) => {
                console.error('Peer error:', err);
                if (this.onStatus) this.onStatus('error', err.type || err.message);
            });
        } catch (e) {
            console.error('PeerJS init failed:', e);
            if (this.onStatus) this.onStatus('error', e.message);
        }
    }

    send(data) {
        if (this.conn && this.conn.open) {
            this.conn.send(data);
        }
    }
}

class PhonePeerConnection {
    constructor(targetRoomId, onDataCallback, onStatusCallback) {
        this.targetRoomId = targetRoomId;
        this.onData = onDataCallback;
        this.onStatus = onStatusCallback;
        this.peer = null;
        this.conn = null;
        this.init();
    }

    init() {
        if (typeof Peer === 'undefined') {
            if (this.onStatus) this.onStatus('error', 'PeerJS 未載入');
            return;
        }

        try {
            this.peer = new Peer({ debug: 1 });

            this.peer.on('open', () => {
                if (this.onStatus) this.onStatus('connecting');
                this.connectToHost();
            });

            this.peer.on('error', (err) => {
                if (this.onStatus) this.onStatus('error', err.type || err.message);
            });
        } catch (e) {
            if (this.onStatus) this.onStatus('error', e.message);
        }
    }

    connectToHost() {
        if (!this.targetRoomId) return;
        this.conn = this.peer.connect(this.targetRoomId, { reliable: false });

        this.conn.on('open', () => {
            if (this.onStatus) this.onStatus('connected');
        });

        this.conn.on('data', (data) => {
            if (this.onData) this.onData(data);
        });

        this.conn.on('close', () => {
            if (this.onStatus) this.onStatus('disconnected');
        });
    }

    send(data) {
        if (this.conn && this.conn.open) {
            this.conn.send(data);
        }
    }
}

window.HostPeerConnection = HostPeerConnection;
window.PhonePeerConnection = PhonePeerConnection;
