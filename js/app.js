// S-Curve Driving Simulator - Main Application
// 電腦端主程式：3D 視角、照後鏡渲染、鳥瞰圖、P/D/R檔位、智慧煞車、教練示範 Autopilot

document.addEventListener('DOMContentLoaded', () => {
    const track = new SCurveTrack();
    const car = new TrainerCar();

    // DOM 元素
    const container = document.getElementById('canvas-container');
    const minimapCanvas = document.getElementById('minimap-canvas');
    const minimapCtx = minimapCanvas.getContext('2d');
    const minimapStatusDot = document.getElementById('minimap-status-dot');
    const alarmBanner = document.getElementById('alarm-banner');
    const gearDisplay = document.getElementById('gear-display');
    const speedDisplay = document.getElementById('speed-display');
    const wheelTurnsDisplay = document.getElementById('wheel-turns-display');
    const brakeStatusDisplay = document.getElementById('brake-status-display');
    const coachHintText = document.getElementById('coach-hint-text');

    const btnDemoMode = document.getElementById('btn-demo-mode');
    const btnSpeedMode = document.getElementById('btn-speed-mode');
    const btnResetMain = document.getElementById('btn-reset-main');

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
    let reverseGuidelineGroup;

    // 鍵盤狀態
    const keys = {
        ArrowLeft: false,
        ArrowRight: false,
        KeyA: false,
        KeyD: false,
        Space: false,
        KeyW: false,
        KeyS: false,
        KeyP: false,
        KeyC: false,
        KeyR: false,
        KeyM: false
    };

    // 速度模式設定 (預設駕訓班超慢速)
    let isSlowTrainingSpeed = true;

    // ==========================================
    // Three.js 3D 渲染與場景建立
    // ==========================================
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

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xfffaed, 0.9);
        dirLight.position.set(20, 45, 20);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 100;
        dirLight.shadow.camera.left = -30;
        dirLight.shadow.camera.right = 30;
        dirLight.shadow.camera.top = 30;
        dirLight.shadow.camera.bottom = -30;
        scene.add(dirLight);

        buildEnvironment();
        buildTrackMeshes();
        buildCarModel();
        buildReverseGuidelineMesh();

        window.addEventListener('resize', onWindowResize);
    }

    function buildEnvironment() {
        const groundGeo = new THREE.PlaneGeometry(180, 180);
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

        // 感應黑管 (橡膠管半徑約 3.5cm)
        const tubeRadius = 0.035;
        const leftCurvePoints = track.leftBorder.map(p => new THREE.Vector3(p.x, tubeRadius, p.z));
        const rightCurvePoints = track.rightBorder.map(p => new THREE.Vector3(p.x, tubeRadius, p.z));

        const leftCurve = new THREE.CatmullRomCurve3(leftCurvePoints);
        const rightCurve = new THREE.CatmullRomCurve3(rightCurvePoints);

        const leftTubeGeo = new THREE.TubeGeometry(leftCurve, 320, tubeRadius, 8, false);
        const rightTubeGeo = new THREE.TubeGeometry(rightCurve, 320, tubeRadius, 8, false);
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

        // 安全島 (黃黑相間路緣石)
        buildCurbs(track.leftBorder, true, roadGroup);
        buildCurbs(track.rightBorder, false, roadGroup);

        // 起點線與終點停止線標記 (白線)
        buildStopLine(0, -6.0, track.laneWidth, roadGroup);
        const endPt = track.centerPoints[track.centerPoints.length - 8];
        buildStopLine(endPt.x, endPt.z, track.laneWidth, roadGroup);

        scene.add(roadGroup);
    }

    function buildStopLine(x, z, width, group) {
        const lineGeo = new THREE.PlaneGeometry(width * 0.9, 0.4);
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        const lineMesh = new THREE.Mesh(lineGeo, lineMat);
        lineMesh.rotation.x = -Math.PI / 2;
        lineMesh.position.set(x, 0.005, z);
        group.add(lineMesh);
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

        // 雨刷噴水孔標記 (教練對齊重點)
        const nozzleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8);
        const nozzleMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

        const leftNozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
        leftNozzle.position.set(-0.35, 0.88, 0.75);
        carMeshGroup.add(leftNozzle);

        const rightNozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
        rightNozzle.position.set(0.35, 0.88, 0.75);
        carMeshGroup.add(rightNozzle);

        // 擋風玻璃教練紅點貼紙 (輔助看點)
        const stickerGeo = new THREE.CircleGeometry(0.025, 16);
        const stickerMat = new THREE.MeshBasicMaterial({ color: 0xff1744, side: THREE.DoubleSide });
        const coachSticker = new THREE.Mesh(stickerGeo, stickerMat);
        coachSticker.position.set(-0.35, 1.05, 0.65);
        coachSticker.rotation.x = -0.4;
        carMeshGroup.add(coachSticker);

        // 3. 擋風玻璃
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

        // 4. 前門把手 (教練口訣核心看點：亮銀色門把！)
        const handleGeo = new THREE.BoxGeometry(0.08, 0.05, 0.22);
        const handleMat = new THREE.MeshStandardMaterial({
            color: 0xd8d8d8,
            metalness: 0.85,
            roughness: 0.15
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

        // 6. 駕駛座方向盤 (擬真 540 度)
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

    function buildReverseGuidelineMesh() {
        reverseGuidelineGroup = new THREE.Group();
        scene.add(reverseGuidelineGroup);
    }

    function updateReverseGuidelineMesh() {
        while (reverseGuidelineGroup.children.length > 0) {
            const obj = reverseGuidelineGroup.children.pop();
            if (obj.geometry) obj.geometry.dispose();
        }

        if (car.gear !== 'R') return;

        const guides = car.getReverseGuidelines(5.0, 16);
        const lineMat = new THREE.LineBasicMaterial({
            color: 0x22c55e,
            linewidth: 3,
            transparent: true,
            opacity: 0.85
        });

        const leftPts = guides.leftTrack.map(p => new THREE.Vector3(p.x, 0.02, p.z));
        const rightPts = guides.rightTrack.map(p => new THREE.Vector3(p.x, 0.02, p.z));

        const leftGeo = new THREE.BufferGeometry().setFromPoints(leftPts);
        const rightGeo = new THREE.BufferGeometry().setFromPoints(rightPts);

        reverseGuidelineGroup.add(new THREE.Line(leftGeo, lineMat));
        reverseGuidelineGroup.add(new THREE.Line(rightGeo, lineMat));
    }

    function onWindowResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        mainCamera.aspect = w / h;
        mainCamera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }

    // 照後鏡攝影機視角更新 (精準對齊門把與地面感應黑管)
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

    // ==========================================
    // 教練示範 Autopilot 引擎 (完美走完 S 彎進退)
    // ==========================================
    class AutopilotController {
        constructor() {
            this.active = false;
            this.mode = 'IDLE'; // 'FORWARD' | 'PAUSE_AT_END' | 'REVERSE' | 'FINISHED'
            this.pauseTimer = 0;
        }

        start() {
            this.active = true;
            this.mode = 'FORWARD';
            this.pauseTimer = 0;
            resetCarToStart();
            car.setGear('D');
            car.setBrake(false);
            btnDemoMode.textContent = '⏹️ 停止示範 (我來開)';
            btnDemoMode.classList.add('active');
        }

        stop() {
            this.active = false;
            this.mode = 'IDLE';
            btnDemoMode.textContent = '🎬 教練完美示範教學';
            btnDemoMode.classList.remove('active');
            car.setBrake(true);
            coachHintText.textContent = '示範結束，你隨時可以切換 D 檔開始練習！';
        }

        update(dt) {
            if (!this.active) return;

            const { index, zone } = track.getZoneInfo(car.x, car.z);

            if (this.mode === 'FORWARD') {
                car.setGear('D');
                car.setBrake(false);

                if (index < 35) {
                    coachHintText.textContent = '【入口直行】車身對齊車道中央，怠速微速緩慢進彎...';
                } else if (index < 145) {
                    coachHintText.textContent = '【第一彎（左彎）】方向盤向左打滿 1.5 圈！注意看左後照鏡：維持左前門把與黑管約 1 拳寬（15cm）';
                } else if (index < 175) {
                    coachHintText.textContent = '【兩彎交接處】車身拉直對齊中線，方向盤迅速回正 1.5 圈，筆直向前慢行';
                } else if (index < 275) {
                    coachHintText.textContent = '【第二彎（右彎）】方向盤向右打滿 1.5 圈！改看右後照鏡：維持右門把與黑管約 1 拳寬';
                } else {
                    coachHintText.textContent = '【抵達終點線】回正方向盤，踩煞車停妥於終點線！準備換 R 檔倒車出彎...';
                }

                // 前進 Pure Pursuit 軌跡追蹤
                if (index >= track.centerPoints.length - 8) {
                    this.mode = 'PAUSE_AT_END';
                    this.pauseTimer = 2.0;
                    car.setBrake(true);
                    return;
                }

                const lookIdx = Math.min(track.centerPoints.length - 1, index + 12);
                const target = track.centerPoints[lookIdx];
                this.steerToward(target.x, target.z, false);

            } else if (this.mode === 'PAUSE_AT_END') {
                car.setBrake(true);
                this.pauseTimer -= dt;
                coachHintText.textContent = `【切換 R 檔】停妥完成！${this.pauseTimer.toFixed(1)} 秒後開始示範倒車出彎...`;
                if (this.pauseTimer <= 0) {
                    this.mode = 'REVERSE';
                    car.setGear('R');
                    car.setBrake(false);
                }

            } else if (this.mode === 'REVERSE') {
                car.setGear('R');
                car.setBrake(false);

                if (index > 250) {
                    coachHintText.textContent = '【倒車第一彎】切換 R 檔，方向盤向右打滿，看右後照鏡保持右後輪及門把與黑管 1 拳寬';
                } else if (index > 155) {
                    coachHintText.textContent = '【倒車交接處】車身與安全島平行時迅速回正 1.5 圈，直線向後倒退';
                } else if (index > 40) {
                    coachHintText.textContent = '【倒車第二彎】換看左後照鏡，方向盤向左打滿 1.5 圈，維持左門把與黑管 1 拳寬';
                } else {
                    coachHintText.textContent = '【順利出彎】回正方向盤，平穩倒退回到起點停止線！';
                }

                if (index <= 5) {
                    this.mode = 'FINISHED';
                    car.setGear('P');
                    car.setBrake(true);
                    coachHintText.textContent = '🎉【示範完成】完美零壓線完成 S 型曲線進退！點擊重置或開始練習！';
                    btnDemoMode.textContent = '🎬 教練完美示範教學';
                    btnDemoMode.classList.remove('active');
                    this.active = false;
                    return;
                }

                const lookIdx = Math.max(0, index - 14);
                const target = track.centerPoints[lookIdx];
                this.steerToward(target.x, target.z, true);
            }
        }

        steerToward(tx, tz, isReverse) {
            const dx = tx - car.x;
            const dz = tz - car.z;
            const cosH = Math.cos(car.heading);
            const sinH = Math.sin(car.heading);

            const localX = dx * cosH - dz * sinH;
            const localZ = dx * sinH + dz * cosH;
            const ld2 = localX * localX + localZ * localZ;
            const kappa = (2.0 * localX) / Math.max(0.01, ld2);

            let steerRad = Math.atan(car.wheelbase * kappa);
            steerRad = Math.max(-car.maxSteerAngleRad, Math.min(car.maxSteerAngleRad, steerRad));
            const targetDeg = (steerRad / car.maxSteerAngleRad) * car.maxWheelAngleDeg;

            const diff = targetDeg - car.steeringWheelAngle;
            const rate = 450;
            car.setSteeringWheelAngle(car.steeringWheelAngle + Math.max(-rate * 0.05, Math.min(rate * 0.05, diff)));
        }
    }

    const autopilot = new AutopilotController();

    // ==========================================
    // 鍵盤與按鈕互動監聽
    // ==========================================
    window.addEventListener('keydown', (e) => {
        if (keys.hasOwnProperty(e.code)) {
            keys[e.code] = true;
            e.preventDefault();
        }

        if (e.code === 'KeyP') setGear('P');
        if (e.code === 'KeyW') setGear('D');
        if (e.code === 'KeyS') setGear('R');
        if (e.code === 'Space') toggleBrake();
        if (e.code === 'KeyC') car.setSteeringWheelAngle(0);
        if (e.code === 'KeyR') resetCarToStart();
        if (e.code === 'KeyM') toggleDemoMode();
    });

    window.addEventListener('keyup', (e) => {
        if (keys.hasOwnProperty(e.code)) keys[e.code] = false;
    });

    function setGear(gear) {
        if (autopilot.active) autopilot.stop();
        car.setGear(gear);
        updateGearAndBrakeUI();
        if (hostPeer) {
            hostPeer.send({ type: 'telemetry', gear: car.gear, isBraking: car.isBraking });
        }
    }

    function toggleBrake() {
        if (autopilot.active) autopilot.stop();
        car.setBrake(!car.isBraking);
        updateGearAndBrakeUI();
    }

    function toggleDemoMode() {
        if (autopilot.active) {
            autopilot.stop();
        } else {
            autopilot.start();
        }
    }

    function handleKeyboardSteering(dt) {
        if (autopilot.active) return;

        let steerChange = 0;
        const steerSpeed = 480;

        if (keys.ArrowLeft || keys.KeyA) steerChange -= steerSpeed * dt;
        if (keys.ArrowRight || keys.KeyD) steerChange += steerSpeed * dt;

        if (steerChange !== 0) {
            car.setSteeringWheelAngle(car.steeringWheelAngle + steerChange);
        }
    }

    function resetCarToStart() {
        if (autopilot.active) autopilot.stop();
        car.reset();
        window.buzzer.stopAlarm();
        alarmBanner.style.display = 'none';
        updateGearAndBrakeUI();
        coachHintText.textContent = '已重置回起點（P 檔安全停車中）。打入 D 檔即可開始練習！';
        if (hostPeer) {
            hostPeer.send({ type: 'status_reset' });
        }
    }

    btnDemoMode.addEventListener('click', toggleDemoMode);
    btnResetMain.addEventListener('click', resetCarToStart);

    btnSpeedMode.addEventListener('click', () => {
        isSlowTrainingSpeed = !isSlowTrainingSpeed;
        if (isSlowTrainingSpeed) {
            car.speedMultiplier = 1.0;
            btnSpeedMode.textContent = '🐢 怠速: 超慢 (1.8km/h)';
        } else {
            car.speedMultiplier = 1.7;
            btnSpeedMode.textContent = '🚗 怠速: 標準 (3.2km/h)';
        }
    });

    function updateGearAndBrakeUI() {
        gearDisplay.textContent = car.gear;
        gearDisplay.className = `gear-badge ${car.gear}`;

        if (car.gear === 'P') {
            brakeStatusDisplay.textContent = 'P 檔停車中';
            brakeStatusDisplay.className = 'brake-status-badge held';
        } else if (car.isBraking) {
            brakeStatusDisplay.textContent = '煞車踩住 (停止)';
            brakeStatusDisplay.className = 'brake-status-badge held';
        } else {
            brakeStatusDisplay.textContent = '怠速滑行中';
            brakeStatusDisplay.className = 'brake-status-badge released';
        }
    }

    // ==========================================
    // 鳥瞰迷你地圖繪製 (包含動態倒車線)
    // ==========================================
    function renderMinimap() {
        const w = minimapCanvas.width = 240;
        const h = minimapCanvas.height = 240;

        minimapCtx.fillStyle = '#171e28';
        minimapCtx.fillRect(0, 0, w, h);

        const scale = 6.4;
        const originX = 184;
        const originY = 171;

        const toMap = (worldX, worldZ) => ({
            x: originX + worldX * scale,
            y: originY - worldZ * scale
        });

        // 道路外框白線
        minimapCtx.lineWidth = 2.5;
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

        // 行駛軌跡線
        if (car.trajectory.length > 1) {
            minimapCtx.lineWidth = 1.8;
            minimapCtx.strokeStyle = 'rgba(77, 163, 255, 0.45)';
            minimapCtx.beginPath();
            for (let i = 0; i < car.trajectory.length; i++) {
                const p = toMap(car.trajectory[i].x, car.trajectory[i].z);
                if (i === 0) minimapCtx.moveTo(p.x, p.y);
                else minimapCtx.lineTo(p.x, p.y);
            }
            minimapCtx.stroke();
        }

        // 倒車模式：鳥瞰圖投射動態綠色引導線
        if (car.gear === 'R') {
            const guides = car.getReverseGuidelines(5.0, 16);
            minimapCtx.lineWidth = 2;
            minimapCtx.strokeStyle = '#22c55e';
            [guides.leftTrack, guides.rightTrack].forEach(trackPts => {
                minimapCtx.beginPath();
                for (let i = 0; i < trackPts.length; i++) {
                    const p = toMap(trackPts[i].x, trackPts[i].z);
                    if (i === 0) minimapCtx.moveTo(p.x, p.y);
                    else minimapCtx.lineTo(p.x, p.y);
                }
                minimapCtx.stroke();
            });
        }

        // 車身方塊
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
        minimapCtx.lineWidth = 1.2;
        minimapCtx.stroke();

        // 四個輪胎壓線狀態
        const tires = car.getTireWorldPositions();
        Object.entries(tires).forEach(([key, tire]) => {
            const tp = toMap(tire.x, tire.z);
            const hit = track.checkTireCollision(tire);

            minimapCtx.fillStyle = hit.isColliding ? '#ff0033' : '#22c55e';
            minimapCtx.beginPath();
            minimapCtx.arc(tp.x, tp.y, hit.isColliding ? 5 : 2.5, 0, Math.PI * 2);
            minimapCtx.fill();
        });

        minimapStatusDot.style.color = car.isPressed ? '#ff1744' : '#22c55e';
        minimapStatusDot.textContent = car.isPressed ? '● 壓管' : '● 正常';
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

    // 更新學員手動駕駛時的教練口訣提示
    function updateManualCoachHint() {
        if (autopilot.active) return;

        if (car.gear === 'P') {
            coachHintText.textContent = '【P 檔停車中】準備出發時，請打入 D 檔前進，對齊車道中央緩慢前行。';
            return;
        }

        const { index, zone } = track.getZoneInfo(car.x, car.z);

        if (car.gear === 'D') {
            if (index < 40) {
                coachHintText.textContent = '【入口直行】車頭對準車道中央慢慢進入，準備向左打方向盤。';
            } else if (index < 145) {
                coachHintText.textContent = '【第一彎（左彎）】看左後照鏡：維持左前門把與黑管約 1 個拳頭寬（15cm），太近回半圈，太遠加轉。';
            } else if (index < 175) {
                coachHintText.textContent = '【兩彎交接處】看到車身即將拉直對齊中線，方向盤迅速回正 1.5 圈，筆直向前慢滑。';
            } else if (index < 275) {
                coachHintText.textContent = '【第二彎（右彎）】改看右後照鏡：維持右前門把與黑管約 1 個拳頭寬度。';
            } else {
                coachHintText.textContent = '【終點停止線】前輪停妥白線內，踩下煞車，準備切換 R 檔進行倒車！';
            }
        } else if (car.gear === 'R') {
            if (index > 250) {
                coachHintText.textContent = '【倒車第一彎】切換 R 檔，方向盤向右打滿，看右後照鏡保持右門把與黑管 1 拳寬。';
            } else if (index > 155) {
                coachHintText.textContent = '【倒車交接處】車身與安全島平行時迅速回正 1.5 圈，直線向後倒退。';
            } else if (index > 40) {
                coachHintText.textContent = '【倒車第二彎】換看左後照鏡，方向盤向左打滿 1.5 圈，維持左門把與黑管 1 拳寬。';
            } else {
                coachHintText.textContent = '【倒車出彎完成】車身回到起跑直線，回正方向盤，平穩退回起點停止線！';
            }
        }
    }

    // ==========================================
    // 動態主迴圈 (RequestAnimationFrame)
    // ==========================================
    let lastTime = performance.now();

    function animate(currentTime) {
        requestAnimationFrame(animate);

        const dt = Math.min((currentTime - lastTime) / 1000, 0.08);
        lastTime = currentTime;

        handleKeyboardSteering(dt);
        autopilot.update(dt);
        car.update(dt);
        updateReverseGuidelineMesh();

        // 輪胎壓線判定
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

        // 更新 3D 車輛與方向盤
        carMeshGroup.position.set(car.x, 0, car.z);
        carMeshGroup.rotation.y = car.heading;

        if (steeringWheelMesh) {
            steeringWheelMesh.rotation.z = - (car.steeringWheelAngle * Math.PI / 180);
        }

        // 更新主視角 (駕駛第一人稱視角)
        const eye = car.getDriverEyePosition();
        mainCamera.position.set(eye.x, eye.y, eye.z);

        const lookDist = 15;
        mainCamera.lookAt(
            car.x + Math.sin(car.heading) * lookDist,
            eye.y - 0.25,
            car.z + Math.cos(car.heading) * lookDist
        );

        updateMirrors();

        // 渲染主畫面與雙側後照鏡
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

        // 左照後鏡
        renderer.setViewport(24, mirrorBottomY, mirrorW, mirrorH);
        renderer.setScissor(24, mirrorBottomY, mirrorW, mirrorH);
        renderer.clearDepth();
        renderer.render(scene, leftMirrorCamera);

        // 右照後鏡
        renderer.setViewport(width - mirrorW - 24, mirrorBottomY, mirrorW, mirrorH);
        renderer.setScissor(width - mirrorW - 24, mirrorBottomY, mirrorW, mirrorH);
        renderer.clearDepth();
        renderer.render(scene, rightMirrorCamera);

        renderer.setScissorTest(false);

        // HUD 數據更新
        updateGearAndBrakeUI();
        speedDisplay.textContent = `${(Math.abs(car.speed) * 3.6).toFixed(1)} km/h`;
        wheelTurnsDisplay.innerHTML = formatWheelTurns(car.steeringWheelAngle);
        updateManualCoachHint();

        renderMinimap();

        // 發送遙測資料給手機端
        if (hostPeer && Math.floor(currentTime / 16) % 10 === 0) {
            hostPeer.send({
                type: 'telemetry',
                isPressed: car.isPressed,
                gear: car.gear,
                angle: car.steeringWheelAngle
            });
        }
    }

    // ==========================================
    // WebRTC PeerJS 連線管理
    // ==========================================
    let hostPeer = null;

    function initWebRTC() {
        hostPeer = new HostPeerConnection(
            (data) => {
                if (data.type === 'steering') {
                    if (!autopilot.active) {
                        car.setSteeringWheelAngle(data.angle);
                    }
                } else if (data.type === 'brake') {
                    if (!autopilot.active) {
                        car.setBrake(data.braking);
                        updateGearAndBrakeUI();
                    }
                } else if (data.type === 'gear') {
                    if (!autopilot.active) {
                        car.setGear(data.gear);
                        updateGearAndBrakeUI();
                    }
                } else if (data.type === 'reset') {
                    resetCarToStart();
                }
            },
            (status, info) => {
                if (status === 'ready') {
                    connectionStatusText.textContent = `房間: ${info}`;
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

    // 啟動主程式
    initThree();
    initWebRTC();
    updateGearAndBrakeUI();
    requestAnimationFrame(animate);
});