// Mobile Steering Wheel Controller Logic
// 手機端控制器：陀螺儀連續累加轉向、觸控支援、踏板與排檔

document.addEventListener('DOMContentLoaded', () => {
    // DOM 元素
    const virtualWheel = document.getElementById('virtual-wheel');
    const turnsBadge = document.getElementById('turns-badge');
    const connDot = document.getElementById('conn-dot');
    const connText = document.getElementById('conn-text');
    const btnGearD = document.getElementById('btn-gear-d');
    const btnGearR = document.getElementById('btn-gear-r');
    const brakePedal = document.getElementById('brake-pedal');
    const btnCalibrate = document.getElementById('btn-calibrate');
    const btnReset = document.getElementById('btn-reset');
    const btnEnableGyro = document.getElementById('btn-enable-gyro');

    // 狀態變數
    let currentAngle = 0; // -540 ~ +540 度
    const maxAngle = 540;
    let gyroZeroOffset = 0;
    let lastRawAngle = null;
    let gyroEnabled = false;
    let isTouchingWheel = false;
    let touchStartAngle = 0;
    let wheelAngleOnTouchStart = 0;

    // 從網址讀取房間代號 (例如 ?room=scurve-1234)
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');

    // 初始化 WebRTC 連線
    let peerClient = null;

    if (roomId) {
        connText.textContent = `連線中 (${roomId})...`;
        peerClient = new PhonePeerConnection(
            roomId,
            // 收到電腦主機狀態 (例如壓線通知)
            (data) => {
                if (data.type === 'telemetry') {
                    if (data.isPressed && navigator.vibrate) {
                        navigator.vibrate(150); // 壓線手機觸覺震動提醒！
                    }
                }
            },
            // 連線狀態變更
            (status) => {
                if (status === 'connected') {
                    connText.textContent = '已連線電腦';
                    connDot.className = 'conn-dot connected';
                } else if (status === 'disconnected') {
                    connText.textContent = '連線中斷';
                    connDot.className = 'conn-dot';
                } else if (status === 'error') {
                    connText.textContent = '連線錯誤';
                    connDot.className = 'conn-dot error';
                }
            }
        );
    } else {
        connText.textContent = '未指定房間 (請掃描電腦端 QR Code)';
    }

    // 發送轉向指令至電腦端
    function sendSteering(angle) {
        if (peerClient) {
            peerClient.send({
                type: 'steering',
                angle: angle
            });
        }
    }

    // 更新方向盤角度與介面顯示
    function updateWheelUI(angle) {
        currentAngle = Math.max(-maxAngle, Math.min(maxAngle, angle));

        // 旋轉手機螢幕上的虛擬方向盤
        virtualWheel.style.transform = `rotate(${currentAngle}deg)`;

        // 更新圈數標籤
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

    // 陀螺儀體感事件處理 (支援雙手橫向握持手機旋轉)
    function handleDeviceOrientation(e) {
        if (!gyroEnabled) return;

        // 手機橫放時，螢幕旋轉角對應 gamma 或 beta
        let rawAngle = 0;
        const orientation = window.orientation || 0;

        if (orientation === 90 || orientation === -90) {
            // 橫放狀態：beta 為左右旋轉
            rawAngle = e.beta;
        } else {
            // 直放狀態：gamma 為左右旋轉
            rawAngle = e.gamma;
        }

        if (rawAngle === null || rawAngle === undefined) return;

        if (lastRawAngle === null) {
            lastRawAngle = rawAngle;
            return;
        }

        // 計算連續旋轉角度差 (Delta)
        let delta = rawAngle - lastRawAngle;

        // 避免 180 度翻轉時突跳
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;

        lastRawAngle = rawAngle;

        // 靈敏度係數 (適度放大手腕轉動幅度，使換手打滿 540 度更加順暢)
        const sensitivity = 1.4;
        updateWheelUI(currentAngle + delta * sensitivity);
    }

    // 請求陀螺儀權限 (iOS 13+ 必備)
    async function requestGyroPermission() {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const response = await DeviceOrientationEvent.requestPermission();
                if (response === 'granted') {
                    gyroEnabled = true;
                    btnEnableGyro.textContent = '體感中 ✅';
                    btnEnableGyro.classList.add('primary');
                    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
                } else {
                    alert('未取得陀螺儀權限，你可以直接在螢幕上滑動轉動方向盤');
                }
            } catch (err) {
                console.error(err);
                alert('陀螺儀啟動失敗，請使用觸控模式');
            }
        } else {
            // Android 或非 iOS 系統直接監聽
            gyroEnabled = true;
            btnEnableGyro.textContent = '體感中 ✅';
            btnEnableGyro.classList.add('primary');
            window.addEventListener('deviceorientation', handleDeviceOrientation, true);
        }
    }

    btnEnableGyro.addEventListener('click', requestGyroPermission);

    // 觸控方向盤旋轉 (備用/可手動轉一圈半)
    function getTouchAngle(touch, elem) {
        const rect = elem.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = touch.clientX - centerX;
        const dy = touch.clientY - centerY;
        return Math.atan2(dy, dx) * 180 / Math.PI;
    }

    virtualWheel.addEventListener('touchstart', (e) => {
        isTouchingWheel = true;
        touchStartAngle = getTouchAngle(e.touches[0], virtualWheel);
        wheelAngleOnTouchStart = currentAngle;
        e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        if (!isTouchingWheel) return;
        const currentTouchAngle = getTouchAngle(e.touches[0], virtualWheel);
        let diff = currentTouchAngle - touchStartAngle;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        updateWheelUI(wheelAngleOnTouchStart + diff * 1.5);
    }, { passive: false });

    window.addEventListener('touchend', () => {
        isTouchingWheel = false;
    });

    // 方向盤一鍵校準 (歸零)
    btnCalibrate.addEventListener('click', () => {
        lastRawAngle = null;
        updateWheelUI(0);
    });

    // 一鍵重新開始
    btnReset.addEventListener('click', () => {
        updateWheelUI(0);
        if (peerClient) {
            peerClient.send({ type: 'reset' });
        }
    });

    // 檔位切換 (D / R)
    btnGearD.addEventListener('click', () => {
        btnGearD.className = 'btn-gear active D';
        btnGearR.className = 'btn-gear';
        if (peerClient) peerClient.send({ type: 'gear', gear: 'D' });
    });

    btnGearR.addEventListener('click', () => {
        btnGearR.className = 'btn-gear active R';
        btnGearD.className = 'btn-gear';
        if (peerClient) peerClient.send({ type: 'gear', gear: 'R' });
    });

    // 煞車踏板 (長按煞車，放開怠速前進)
    const startBraking = (e) => {
        e.preventDefault();
        brakePedal.classList.add('braking');
        if (peerClient) peerClient.send({ type: 'brake', braking: true });
    };

    const stopBraking = (e) => {
        e.preventDefault();
        brakePedal.classList.remove('braking');
        if (peerClient) peerClient.send({ type: 'brake', braking: false });
    };

    brakePedal.addEventListener('touchstart', startBraking, { passive: false });
    brakePedal.addEventListener('touchend', stopBraking, { passive: false });
    brakePedal.addEventListener('mousedown', startBraking);
    brakePedal.addEventListener('mouseup', stopBraking);
    brakePedal.addEventListener('mouseleave', stopBraking);
});
