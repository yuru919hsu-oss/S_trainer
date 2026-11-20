// Mobile Steering Wheel Controller Logic
// 手機端控制器：P/D/R 檔位、智慧煞車 (點擊鎖定/長按)、540度體感陀螺儀、全螢幕適配

document.addEventListener('DOMContentLoaded', () => {
    // DOM 元素
    const virtualWheel = document.getElementById('virtual-wheel');
    const turnsBadge = document.getElementById('turns-badge');
    const connDot = document.getElementById('conn-dot');
    const connText = document.getElementById('conn-text');
    const gearIndicatorPill = document.getElementById('gear-indicator-pill');

    const btnGearP = document.getElementById('btn-gear-p');
    const btnGearD = document.getElementById('btn-gear-d');
    const btnGearR = document.getElementById('btn-gear-r');
    const brakePedal = document.getElementById('brake-pedal');
    const pedalSubText = document.getElementById('pedal-sub-text');

    const btnCalibrate = document.getElementById('btn-calibrate');
    const btnReset = document.getElementById('btn-reset');
    const btnEnableGyro = document.getElementById('btn-enable-gyro');

    // 控制器狀態
    let currentAngle = 0; // -540 ~ +540 度
    const maxAngle = 540;
    let lastRawAngle = null;
    let gyroEnabled = false;
    let isTouchingWheel = false;
    let touchStartAngle = 0;
    let wheelAngleOnTouchStart = 0;

    let currentGear = 'P'; // 預設 P 檔停車
    let isAutoHeld = true; // 智慧煞車預設鎖定煞停
    let isHoldingBrake = false;
    let touchStartTime = 0;

    // 從網址讀取房間代號 (例如 ?room=scurve-1234)
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');

    let peerClient = null;

    if (roomId) {
        connText.textContent = `連線中 (${roomId})...`;
        peerClient = new PhonePeerConnection(
            roomId,
            (data) => {
                if (data.type === 'telemetry') {
                    if (data.isPressed && navigator.vibrate) {
                        navigator.vibrate(120); // 壓線手機震動反饋
                    }
                    if (data.gear && data.gear !== currentGear) {
                        updateGearUI(data.gear, false);
                    }
                }
            },
            (status) => {
                if (status === 'connected') {
                    connText.textContent = '已連線電腦';
                    connDot.className = 'conn-dot connected';
                    // 連線成功發送初始狀態
                    syncAllStateToHost();
                } else if (status === 'disconnected') {
                    connText.textContent = '連線中斷';
                    connDot.className = 'conn-dot';
                } else if (status === 'error') {
                    connText.textContent = '連線異常';
                    connDot.className = 'conn-dot error';
                }
            }
        );
    } else {
        connText.textContent = '未指定房間 (請掃描電腦端 QR Code)';
    }

    function syncAllStateToHost() {
        if (!peerClient) return;
        peerClient.send({ type: 'gear', gear: currentGear });
        peerClient.send({ type: 'brake', braking: isAutoHeld || currentGear === 'P' });
        peerClient.send({ type: 'steering', angle: currentAngle });
    }

    function sendSteering(angle) {
        if (peerClient) {
            peerClient.send({
                type: 'steering',
                angle: angle
            });
        }
    }

    // 更新方向盤角度與 UI
    function updateWheelUI(angle) {
        currentAngle = Math.max(-maxAngle, Math.min(maxAngle, angle));
        virtualWheel.style.transform = `rotate(${currentAngle}deg)`;

        const turns = (currentAngle / 360).toFixed(1);
        if (Math.abs(currentAngle) < 15) {
            turnsBadge.textContent = '已回正 (0.0 圈)';
            turnsBadge.className = 'turns-badge straight';
        } else {
            const dir = currentAngle > 0 ? '右' : '左';
            const isLock = Math.abs(currentAngle) >= 530;
            turnsBadge.textContent = `向${dir} ${Math.abs(turns)} 圈${isLock ? ' (打到底)' : ''}`;
            turnsBadge.className = isLock ? 'turns-badge locked' : 'turns-badge';
        }

        sendSteering(currentAngle);
    }

    // 檔位切換處理
    function updateGearUI(gear, notifyHost = true) {
        currentGear = gear;
        [btnGearP, btnGearD, btnGearR].forEach(btn => btn.classList.remove('active'));

        if (gear === 'P') {
            btnGearP.classList.add('active');
            gearIndicatorPill.textContent = 'P 檔 (停車)';
            gearIndicatorPill.className = 'gear-indicator-pill P';
            // 打入 P 檔自動啟動煞車鎖定
            setBrakeState(true);
        } else if (gear === 'D') {
            btnGearD.classList.add('active');
            gearIndicatorPill.textContent = 'D 檔 (前進)';
            gearIndicatorPill.className = 'gear-indicator-pill D';
        } else if (gear === 'R') {
            btnGearR.classList.add('active');
            gearIndicatorPill.textContent = 'R 檔 (倒退)';
            gearIndicatorPill.className = 'gear-indicator-pill R';
        }

        if (notifyHost && peerClient) {
            peerClient.send({ type: 'gear', gear: gear });
        }
    }

    btnGearP.addEventListener('click', () => updateGearUI('P'));
    btnGearD.addEventListener('click', () => updateGearUI('D'));
    btnGearR.addEventListener('click', () => updateGearUI('R'));

    // 智慧煞車狀態控制
    function setBrakeState(braking) {
        isAutoHeld = braking;
        if (braking) {
            brakePedal.classList.add('auto-held');
            pedalSubText.textContent = '已煞停 (點擊出發)';
        } else {
            brakePedal.classList.remove('auto-held');
            pedalSubText.textContent = '怠速滑行中 (點擊煞車)';
        }
        if (peerClient) {
            peerClient.send({ type: 'brake', braking: braking });
        }
    }

    // 煞車踏板互動：短按切換 (Auto-Hold 鎖定/解鎖)，長按按住煞車
    brakePedal.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        touchStartTime = Date.now();
        isHoldingBrake = true;
        brakePedal.classList.add('braking');
        if (peerClient) peerClient.send({ type: 'brake', braking: true });
    });

    window.addEventListener('pointerup', (e) => {
        if (!isHoldingBrake) return;
        isHoldingBrake = false;
        brakePedal.classList.remove('braking');

        const holdDuration = Date.now() - touchStartTime;
        if (holdDuration < 320) {
            // 短按：切換 Auto-Hold 狀態
            setBrakeState(!isAutoHeld);
        } else {
            // 長按放開：恢復先前狀態或放開
            if (currentGear === 'P') {
                setBrakeState(true);
            } else {
                setBrakeState(false);
            }
        }
    });

    // 陀螺儀體感事件處理 (橫握與直握自適應)
    function handleDeviceOrientation(e) {
        if (!gyroEnabled) return;

        let rawAngle = 0;
        const orientation = window.orientation || (screen.orientation ? screen.orientation.angle : 0) || 0;

        if (orientation === 90 || orientation === -90) {
            rawAngle = e.beta;
        } else {
            rawAngle = e.gamma;
        }

        if (rawAngle === null || rawAngle === undefined) return;

        if (lastRawAngle === null) {
            lastRawAngle = rawAngle;
            return;
        }

        let delta = rawAngle - lastRawAngle;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;

        lastRawAngle = rawAngle;

        // 靈敏度係數 (轉向平滑自然)
        const sensitivity = 1.35;
        updateWheelUI(currentAngle + delta * sensitivity);
    }

    // 請求陀螺儀權限 (iOS 13+ 必備)
    async function requestGyroPermission() {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const response = await DeviceOrientationEvent.requestPermission();
                if (response === 'granted') {
                    gyroEnabled = true;
                    btnEnableGyro.classList.add('primary');
                    btnEnableGyro.querySelector('.btn-txt').textContent = '體感運作中';
                    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
                } else {
                    alert('未取得陀螺儀權限，可直接在螢幕上滑動方向盤');
                }
            } catch (err) {
                console.error(err);
                alert('陀螺儀啟動失敗，請使用觸控模式');
            }
        } else {
            gyroEnabled = true;
            btnEnableGyro.classList.add('primary');
            btnEnableGyro.querySelector('.btn-txt').textContent = '體感運作中';
            window.addEventListener('deviceorientation', handleDeviceOrientation, true);
        }
    }

    btnEnableGyro.addEventListener('click', requestGyroPermission);

    // 觸控方向盤備用拖曳
    function getTouchAngle(touch, elem) {
        const rect = elem.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        return Math.atan2(touch.clientY - centerY, touch.clientX - centerX) * 180 / Math.PI;
    }

    virtualWheel.addEventListener('pointerdown', (e) => {
        isTouchingWheel = true;
        touchStartAngle = getTouchAngle(e, virtualWheel);
        wheelAngleOnTouchStart = currentAngle;
        e.preventDefault();
    });

    window.addEventListener('pointermove', (e) => {
        if (!isTouchingWheel) return;
        const currentTouchAngle = getTouchAngle(e, virtualWheel);
        let diff = currentTouchAngle - touchStartAngle;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        updateWheelUI(wheelAngleOnTouchStart + diff * 1.5);
    });

    window.addEventListener('pointerup', () => {
        isTouchingWheel = false;
    });

    // 一鍵校準 (歸零)
    btnCalibrate.addEventListener('click', () => {
        lastRawAngle = null;
        updateWheelUI(0);
    });

    // 一鍵重置回起點 (重置方向盤歸零、切回 P 檔、啟動煞停)
    btnReset.addEventListener('click', () => {
        lastRawAngle = null;
        updateWheelUI(0);
        updateGearUI('P');
        setBrakeState(true);
        if (peerClient) {
            peerClient.send({ type: 'reset' });
        }
    });

    // 初始進入狀態：P 檔、煞停鎖定
    updateGearUI('P');
    setBrakeState(true);
});