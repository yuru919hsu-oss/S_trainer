// S-Curve Driving Simulator - Main Application
// 電腦端主程式：3D 視角、照後鏡渲染、鳥瞰圖與車輛邏輯

document.addEventListener('DOMContentLoaded', () => {
    const track = new SCurveTrack();
    const car = new TrainerCar();

    const container = document.getElementById('canvas-container');
    const minimapCanvas = document.getElementById('minimap-canvas');
    const minimapCtx = minimapCanvas.getContext('2d');
    const alarmBanner = document.getElementById('alarm-banner');
    const gearDisplay = document.getElementById('gear-display');
    const speedDisplay = document.getElementById('speed-display');
    const wheelTurnsDisplay = document.getElementById('wheel-turns-display');
    const connectionPill = document.getElementById('connection-pill');
    const connectionStatusText = document.getElementById('connection-status-text');
    const connectionDot = document.getElementById('connection-dot');
    const qrModal = document.getElementById('qr-modal');
    const closeQrBtn = document.getElementById('close-qr-btn');
    const copyUrlBtn = document.getElementById('copy-url-btn');
    const phoneUrlInput = document.getElementById('phone-url-input');
    const qrcodeContainer = document.getElementById('qrcode-container');

    let scene, renderer;
    let mainCamera;
    let leftMirrorCamera, rightMirrorCamera;
    let carMeshGroup, steeringWheelMesh;

    const keys = {
        ArrowLeft: false,
        ArrowRight: false,
        KeyA: false,
        KeyD: false,
        Space: false,
        KeyW: false,
        KeyS: false,
        KeyC: false
    };

    function initThree() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x8fa3b5);
        scene.fog = new THREE.FogExp2(0x8fa3b5, 0.015);

        mainCamera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 150);
        leftMirrorCamera = new THREE.PerspectiveCamera(55, 250 / 155, 0.1, 50);
        rightMirrorCamera = new THREE.PerspectiveCamera(55, 250 / 155, 0.1, 50);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.autoClear = false;
        container.appendChild(renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xfffaed, 0.9);
        dirLight.position.set(20, 40, 20);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 100;
        dirLight.shadow.camera.left = -25;
        dirLight.shadow.camera.right = 25;
        dirLight.shadow.camera.top = 25;
        dirLight.shadow.camera.bottom = -25;
        scene.add(dirLight);

        buildEnvironment();
        buildTrackMeshes();
        buildCarModel();

        window.addEventListener('resize', onWindowResize);
    }

    function buildEnvironment() {
        const groundGeo = new THREE.PlaneGeometry(160, 160);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0x3d473d });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.02;
        ground.receiveShadow = true;
        scene.add(ground);
    }

    function buildTrackMeshes() {
        const roadGroup = new THREE.Group();
        const vertices = [];
        const uvs = [];
        const indices = [];

        for (let i = 0; i < track.centerPoints.length; i++) {
            const lp = track.leftBorder[i];
            const rp = track.rightBorder[i];

            vertices.push(lp.x, 0.0, lp.z);
            vertices.push(rp.x, 0.0, rp.z);

            uvs.push(0, i / track.centerPoints.length * 10);
            uvs.push(1, i / track.centerPoints.length * 10);

            if (i < track.centerPoints.length - 1) {
                const base = i * 2;
                indices.push(base, base + 1, base + 2);
                indices.push(base + 1, base + 3, base + 2);
            }
        }

        const roadGeo = new THREE.BufferGeometry();
        roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        roadGeo.setIndex(indices);
        roadGeo.computeVertexNormals();

        const roadMat = new THREE.MeshLambertMaterial({
            color: 0x22252a,
            roughness: 0.85
        });
        const roadMesh = new THREE.Mesh(roadGeo, roadMat);
        roadMesh.receiveShadow = true;
        roadGroup.add(roadMesh);

        // 感應黑管
        const tubeRadius = 0.035;
        const leftCurvePoints = track.leftBorder.map(p => new THREE.Vector3(p.x, tubeRadius, p.z));
        const rightCurvePoints = track.rightBorder.map(p => new THREE.Vector3(p.x, tubeRadius, p.z));

        const leftCurve = new THREE.CatmullRomCurve3(leftCurvePoints);
        const rightCurve = new THREE.CatmullRomCurve3(rightCurvePoints);

        const leftTubeGeo = new THREE.TubeGeometry(leftCurve, 300, tubeRadius, 8, false);
        const rightTubeGeo = new THREE.TubeGeometry(rightCurve, 300, tubeRadius, 8, false);
        const tubeMat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.9,
            metalness: 0.1
        });

        const leftTube = new THREE.Mesh(leftTubeGeo, tubeMat);
        const rightTube = new THREE.Mesh(rightTubeGeo, tubeMat);
        leftTube.castShadow = true;
        rightTube.castShadow = true;
        roadGroup.add(leftTube);
        roadGroup.add(rightTube);

        // 安全島
        buildCurbs(track.leftBorder, true, roadGroup);
        buildCurbs(track.rightBorder, false, roadGroup);

        scene.add(roadGroup);
    }

    function buildCurbs(borderPoints, isLeft, group) {
        const curbHeight = 0.15;
        const curbWidth = 0.45;
        const sign = isLeft ? 1 : -1;

        for (let i = 0; i < borderPoints.length - 1; i += 2) {
            const p1 = borderPoints[i];
            const p2 = borderPoints[Math.min(i + 2, borderPoints.length - 1)];

            const dx = p2.x - p1.x;
            const dz = p2.z - p1.z;
            const len = Math.hypot(dx, dz);
            if (len < 0.05) continue;

            const angle = Math.atan2(dx, dz);
            const midX = (p1.x + p2.x) / 2;
            const midZ = (p1.z + p2.z) / 2;

            const nx = -dz / len * sign;
            const nz = dx / len * sign;

            const curbGeo = new THREE.BoxGeometry(curbWidth, curbHeight, len);
            const isYellow = (Math.floor(i / 6) % 2 === 0);
            const curbMat = new THREE.MeshLambertMaterial({
                color: isYellow ? 0xffcc00 : 0x222222
            });

            const curb = new THREE.Mesh(curbGeo, curbMat);
            curb.position.set(midX + nx * (curbWidth / 2 + 0.05), curbHeight / 2, midZ + nz * (curbWidth / 2 + 0.05));
            curb.rotation.y = angle;
            curb.receiveShadow = true;
            curb.castShadow = true;
            group.add(curb);
        }
    }

    function buildCarModel() {
        carMeshGroup = new THREE.Group();

        const bodyPaintMat = new THREE.MeshStandardMaterial({
            color: 0xf5f6f8,
            roughness: 0.3,
            metalness: 0.1
        });

        // 1. 車身
        const bodyGeo = new THREE.BoxGeometry(car.width, 0.7, car.length);
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyPaintMat);
        bodyMesh.position.y = 0.55;
        bodyMesh.castShadow = true;
        carMeshGroup.add(bodyMesh);

        // 2. 引擎蓋 (車頭蓋)
        const hoodGeo = new THREE.BoxGeometry(car.width * 0.94, 0.18, 1.35);
        const hoodMesh = new THREE.Mesh(hoodGeo, bodyPaintMat);
        hoodMesh.position.set(0, 0.76, 1.25);
        hoodMesh.rotation.x = 0.08;
        carMeshGroup.add(hoodMesh);

        // 雨刷噴水孔標記
        const nozzleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8);
        const nozzleMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

        const leftNozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
        leftNozzle.position.set(-0.35, 0.88, 0.75);
        carMeshGroup.add(leftNozzle);

        const rightNozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
        rightNozzle.position.set(0.35, 0.88, 0.75);
        carMeshGroup.add(rightNozzle);

        // 3. 前擋風玻璃
        const cabinGeo = new THREE.BoxGeometry(car.width * 0.88, 0.55, 1.8);
        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0x90b0d0,
            transparent: true,
            opacity: 0.35,
            roughness: 0.1
        });
        const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
        cabinMesh.position.set(0, 1.15, -0.2);
        carMeshGroup.add(cabinMesh);

        // 4. 前門把手 (教練強調看的亮銀色前門把手！)
        const handleGeo = new THREE.BoxGeometry(0.08, 0.05, 0.22);
        const handleMat = new THREE.MeshStandardMaterial({
            color: 0xd8d8d8,
            metalness: 0.8,
            roughness: 0.2
        });

        const leftHandle = new THREE.Mesh(handleGeo, handleMat);
        leftHandle.position.set(-car.width / 2 - 0.04, 0.78, 0.15);
        carMeshGroup.add(leftHandle);

        const rightHandle = new THREE.Mesh(handleGeo, handleMat);
        rightHandle.position.set(car.width / 2 + 0.04, 0.78, 0.15);
        carMeshGroup.add(rightHandle);

        // 5. 照後鏡外殼
        const mirrorHousingGeo = new THREE.BoxGeometry(0.24, 0.15, 0.12);
        const leftHousing = new THREE.Mesh(mirrorHousingGeo, bodyPaintMat);
        leftHousing.position.set(-car.width / 2 - 0.15, 0.98, 0.55);
        leftHousing.rotation.y = 0.2;
        carMeshGroup.add(leftHousing);

        const rightHousing = new THREE.Mesh(mirrorHousingGeo, bodyPaintMat);
        rightHousing.position.set(car.width / 2 + 0.15, 0.98, 0.55);
        rightHousing.rotation.y = -0.2;
        carMeshGroup.add(rightHousing);

        // 6. 方向盤
        const wheelGeo = new THREE.TorusGeometry(0.2, 0.025, 12, 32);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });
        steeringWheelMesh = new THREE.Mesh(wheelGeo, wheelMat);
        steeringWheelMesh.position.set(-0.38, 0.96, 0.1);
        steeringWheelMesh.rotation.x = -0.4;
        carMeshGroup.add(steeringWheelMesh);

        const markerGeo = new THREE.BoxGeometry(0.03, 0.06, 0.03);
        const markerMat = new THREE.MeshBasicMaterial({ color: 0xffeb3b });
        const topMarker = new THREE.Mesh(markerGeo, markerMat);
        topMarker.position.set(0, 0.2, 0);
        steeringWheelMesh.add(topMarker);

        scene.add(carMeshGroup);
    }

    function onWindowResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        mainCamera.aspect = w / h;
        mainCamera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }

    function updateMirrors() {
        const cosH = Math.cos(car.heading);
        const sinH = Math.sin(car.heading);

        const lxLocal = -car.width / 2 - 0.18;
        const lyLocal = 0.98;
        const lzLocal = 0.55;

        leftMirrorCamera.position.set(
            car.x + (lxLocal * cosH + lzLocal * sinH),
            lyLocal,
            car.z + (-lxLocal * sinH + lzLocal * cosH)
        );

        const targetLx = -car.width / 2 - 0.25;
        const targetLz = -2.5;
        leftMirrorCamera.lookAt(
            car.x + (targetLx * cosH + targetLz * sinH),
            0.1,
            car.z + (-targetLx * sinH + targetLz * cosH)
        );

        const rxLocal = car.width / 2 + 0.18;
        const ryLocal = 0.98;
        const rzLocal = 0.55;

        rightMirrorCamera.position.set(
            car.x + (rxLocal * cosH + rzLocal * sinH),
            ryLocal,
            car.z + (-rxLocal * sinH + rzLocal * cosH)
        );

        const targetRx = car.width / 2 + 0.25;
        const targetRz = -2.5;
        rightMirrorCamera.lookAt(
            car.x + (targetRx * cosH + targetRz * sinH),
            0.1,
            car.z + (-targetRx * sinH + targetRz * cosH)
        );
    }

    window.addEventListener('keydown', (e) => {
        if (keys.hasOwnProperty(e.code)) {
            keys[e.code] = true;
            e.preventDefault();
        }

        if (e.code === 'Space') car.setBrake(true);
        if (e.code === 'KeyW') car.setGear('D');
        if (e.code === 'KeyS') car.setGear('R');
        if (e.code === 'KeyC') car.setSteeringWheelAngle(0);
        if (e.code === 'KeyR') resetCarToStart();
    });

    window.addEventListener('keyup', (e) => {
        if (keys.hasOwnProperty(e.code)) keys[e.code] = false;
        if (e.code === 'Space') car.setBrake(false);
    });

    function handleKeyboardSteering(dt) {
        let steerChange = 0;
        const steerSpeed = 480;

        if (keys.ArrowLeft || keys.KeyA) steerChange -= steerSpeed * dt;
        if (keys.ArrowRight || keys.KeyD) steerChange += steerSpeed * dt;

        if (steerChange !== 0) {
            car.setSteeringWheelAngle(car.steeringWheelAngle + steerChange);
        }
    }

    function resetCarToStart() {
        car.reset();
        window.buzzer.stopAlarm();
        alarmBanner.style.display = 'none';
        if (hostPeer) {
            hostPeer.send({ type: 'status_reset' });
        }
    }

    function renderMinimap() {
        const w = minimapCanvas.width = 240;
        const h = minimapCanvas.height = 240;

        minimapCtx.fillStyle = '#171e28';
        minimapCtx.fillRect(0, 0, w, h);

        const scale = 5.2;
        const originX = w / 2 - 15;
        const originY = h - 35;

        const toMap = (worldX, worldZ) => ({
            x: originX + worldX * scale,
            y: originY - worldZ * scale
        });

        minimapCtx.lineWidth = 3;
        minimapCtx.strokeStyle = '#e2e8f0';

        minimapCtx.beginPath();
        for (let i = 0; i < track.leftBorder.length; i++) {
            const p = toMap(track.leftBorder[i].x, track.leftBorder[i].z);
            if (i === 0) minimapCtx.moveTo(p.x, p.y);
            else minimapCtx.lineTo(p.x, p.y);
        }
        minimapCtx.stroke();

        minimapCtx.beginPath();
        for (let i = 0; i < track.rightBorder.length; i++) {
            const p = toMap(track.rightBorder[i].x, track.rightBorder[i].z);
            if (i === 0) minimapCtx.moveTo(p.x, p.y);
            else minimapCtx.lineTo(p.x, p.y);
        }
        minimapCtx.stroke();

        if (car.trajectory.length > 1) {
            minimapCtx.lineWidth = 2;
            minimapCtx.strokeStyle = 'rgba(77, 163, 255, 0.45)';
            minimapCtx.beginPath();
            for (let i = 0; i < car.trajectory.length; i++) {
                const p = toMap(car.trajectory[i].x, car.trajectory[i].z);
                if (i === 0) minimapCtx.moveTo(p.x, p.y);
                else minimapCtx.lineTo(p.x, p.y);
            }
            minimapCtx.stroke();
        }

        const cosH = Math.cos(car.heading);
        const sinH = Math.sin(car.heading);
        const hw = car.width / 2;
        const hl = car.length / 2;

        const corners = [
            { x: -hw, z: hl },
            { x: hw, z: hl },
            { x: hw, z: -hl },
            { x: -hw, z: -hl }
        ].map(pt => toMap(
            car.x + (pt.x * cosH + pt.z * sinH),
            car.z + (-pt.x * sinH + pt.z * cosH)
        ));

        minimapCtx.fillStyle = car.isPressed ? '#ff1744' : '#38bdf8';
        minimapCtx.beginPath();
        minimapCtx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i++) {
            minimapCtx.lineTo(corners[i].x, corners[i].y);
        }
        minimapCtx.closePath();
        minimapCtx.fill();
        minimapCtx.strokeStyle = '#ffffff';
        minimapCtx.lineWidth = 1.5;
        minimapCtx.stroke();

        const tires = car.getTireWorldPositions();
        const steerRad = car.getFrontWheelSteerAngle();
        const tireLen = 0.5;

        [tires.fl, tires.fr].forEach(tire => {
            const tp = toMap(tire.x, tire.z);
            const tireHeading = car.heading + steerRad;
            const dx = Math.sin(tireHeading) * (tireLen * scale / 2);
            const dy = -Math.cos(tireHeading) * (tireLen * scale / 2);

            minimapCtx.strokeStyle = '#facc15';
            minimapCtx.lineWidth = 3;
            minimapCtx.beginPath();
            minimapCtx.moveTo(tp.x - dx, tp.y - dy);
            minimapCtx.lineTo(tp.x + dx, tp.y + dy);
            minimapCtx.stroke();
        });

        Object.entries(tires).forEach(([key, tire]) => {
            const tp = toMap(tire.x, tire.z);
            const hit = track.checkTireCollision(tire);

            minimapCtx.fillStyle = hit.isColliding ? '#ff0033' : '#22c55e';
            minimapCtx.beginPath();
            minimapCtx.arc(tp.x, tp.y, hit.isColliding ? 5 : 3, 0, Math.PI * 2);
            minimapCtx.fill();
        });
    }

    function formatWheelTurns(deg) {
        const turns = (deg / 360).toFixed(1);
        if (Math.abs(deg) < 15) {
            return `<span class="wheel-turns-val straight">已回正 (0.0 圈)</span>`;
        }
        const dir = deg > 0 ? '右' : '左';
        const isFullLock = Math.abs(deg) >= 530;
        const lockText = isFullLock ? ' (打到底)' : '';
        return `<span class="wheel-turns-val">向${dir} ${Math.abs(turns)} 圈${lockText}</span>`;
    }

    let lastTime = performance.now();

    function animate(currentTime) {
        requestAnimationFrame(animate);

        const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
        lastTime = currentTime;

        handleKeyboardSteering(dt);
        car.update(dt);

        const tires = car.getTireWorldPositions();
        const hitFL = track.checkTireCollision(tires.fl);
        const hitFR = track.checkTireCollision(tires.fr);
        const hitRL = track.checkTireCollision(tires.rl);
        const hitRR = track.checkTireCollision(tires.rr);

        const isAnyPressed = hitFL.isColliding || hitFR.isColliding || hitRL.isColliding || hitRR.isColliding;
        car.isPressed = isAnyPressed;

        if (isAnyPressed) {
            window.buzzer.startAlarm();
            alarmBanner.style.display = 'block';
        } else {
            window.buzzer.stopAlarm();
            alarmBanner.style.display = 'none';
        }

        carMeshGroup.position.set(car.x, 0, car.z);
        carMeshGroup.rotation.y = car.heading;

        if (steeringWheelMesh) {
            steeringWheelMesh.rotation.z = - (car.steeringWheelAngle * Math.PI / 180);
        }

        const eye = car.getDriverEyePosition();
        mainCamera.position.set(eye.x, eye.y, eye.z);

        const lookDist = 15;
        mainCamera.lookAt(
            car.x + Math.sin(car.heading) * lookDist,
            eye.y - 0.25,
            car.z + Math.cos(car.heading) * lookDist
        );

        updateMirrors();

        const width = window.innerWidth;
        const height = window.innerHeight;
        renderer.setViewport(0, 0, width, height);
        renderer.setScissor(0, 0, width, height);
        renderer.setScissorTest(false);
        renderer.clear();
        renderer.render(scene, mainCamera);

        const mirrorW = 250;
        const mirrorH = 155;
        const mirrorBottomY = 24;

        renderer.setScissorTest(true);

        renderer.setViewport(24, mirrorBottomY, mirrorW, mirrorH);
        renderer.setScissor(24, mirrorBottomY, mirrorW, mirrorH);
        renderer.clearDepth();
        renderer.render(scene, leftMirrorCamera);

        renderer.setViewport(width - mirrorW - 24, mirrorBottomY, mirrorW, mirrorH);
        renderer.setScissor(width - mirrorW - 24, mirrorBottomY, mirrorW, mirrorH);
        renderer.clearDepth();
        renderer.render(scene, rightMirrorCamera);

        renderer.setScissorTest(false);

        gearDisplay.textContent = car.gear;
        gearDisplay.className = `gear-badge ${car.gear}`;
        speedDisplay.textContent = `${(Math.abs(car.speed) * 3.6).toFixed(1)} km/h`;
        wheelTurnsDisplay.innerHTML = formatWheelTurns(car.steeringWheelAngle);

        renderMinimap();

        if (hostPeer && Math.floor(currentTime / 16) % 10 === 0) {
            hostPeer.send({
                type: 'telemetry',
                isPressed: car.isPressed,
                gear: car.gear,
                angle: car.steeringWheelAngle
            });
        }
    }

    let hostPeer = null;

    function initWebRTC() {
        hostPeer = new HostPeerConnection(
            (data) => {
                if (data.type === 'steering') {
                    car.setSteeringWheelAngle(data.angle);
                } else if (data.type === 'brake') {
                    car.setBrake(data.braking);
                } else if (data.type === 'gear') {
                    car.setGear(data.gear);
                } else if (data.type === 'reset') {
                    resetCarToStart();
                }
            },
            (status, info) => {
                if (status === 'ready') {
                    connectionStatusText.textContent = `房間代碼: ${info}`;
                    setupQrCode(info);
                } else if (status === 'connected') {
                    connectionStatusText.textContent = '手機已連線！';
                    connectionDot.className = 'status-dot connected';
                    setTimeout(() => qrModal.classList.add('hidden'), 800);
                } else if (status === 'disconnected') {
                    connectionStatusText.textContent = '手機已斷線';
                    connectionDot.className = 'status-dot';
                } else if (status === 'error') {
                    connectionStatusText.textContent = '連線服務異常';
                    connectionDot.className = 'status-dot error';
                }
            }
        );
    }

    function setupQrCode(roomId) {
        qrcodeContainer.innerHTML = '';
        const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
        const phoneUrl = `${baseUrl}/wheel.html?room=${roomId}`;
        phoneUrlInput.value = phoneUrl;

        new QRCode(qrcodeContainer, {
            text: phoneUrl,
            width: 200,
            height: 200,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
    }

    connectionPill.addEventListener('click', () => {
        qrModal.classList.remove('hidden');
    });

    closeQrBtn.addEventListener('click', () => {
        qrModal.classList.add('hidden');
    });

    copyUrlBtn.addEventListener('click', () => {
        phoneUrlInput.select();
        document.execCommand('copy');
        copyUrlBtn.textContent = '已複製！';
        setTimeout(() => copyUrlBtn.textContent = '複製網址', 2000);
    });

    initThree();
    initWebRTC();
    requestAnimationFrame(animate);
});
