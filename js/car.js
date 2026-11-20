// Car Kinematics & Driver Geometry
// 規格以台灣教練車最常見的 Toyota Vios 為基準

class TrainerCar {
    constructor() {
        this.length = 4.41;
        this.width = 1.70;
        this.wheelbase = 2.55; // 前後軸距 L
        this.wheelTrack = 1.48; // 輪距

        this.maxWheelAngleDeg = 540; // 1.5 圈 = 540 度
        this.maxSteerAngleRad = 36 * Math.PI / 180; // 前輪最大打到底約 36 度

        this.reset();
    }

    reset() {
        this.x = 0;
        this.z = -7.0;
        this.heading = 0;

        this.steeringWheelAngle = 0;
        this.targetSteeringWheelAngle = 0;
        this.gear = 'P'; // 預設 P 檔停車，避免一重置就往前衝！
        this.isBraking = false;
        this.autoHold = false;
        this.speed = 0;

        // 台灣駕訓班標準爬行微速 (約 1.5 ~ 1.9 km/h，超慢速讓學員充分練習看點與轉圈)
        this.creepSpeedD = 0.52;
        this.creepSpeedR = -0.42;
        this.speedMultiplier = 1.0;

        this.isPressed = false;
        this.pressedDetails = {
            fl: false,
            fr: false,
            rl: false,
            rr: false
        };

        this.trajectory = [];
    }

    setSteeringWheelAngle(deg) {
        this.steeringWheelAngle = Math.max(-this.maxWheelAngleDeg, Math.min(this.maxWheelAngleDeg, deg));
    }

    setGear(gear) {
        if (gear === 'P' || gear === 'D' || gear === 'R') {
            this.gear = gear;
            if (gear === 'P') {
                this.speed = 0;
            }
        }
    }

    setBrake(pressed) {
        this.isBraking = pressed;
    }

    getFrontWheelSteerAngle() {
        const ratio = this.steeringWheelAngle / this.maxWheelAngleDeg;
        return ratio * this.maxSteerAngleRad;
    }

    update(dt) {
        let targetSpeed = 0;
        if (this.gear === 'D' && !this.isBraking && !this.autoHold) {
            targetSpeed = this.creepSpeedD * this.speedMultiplier;
        } else if (this.gear === 'R' && !this.isBraking && !this.autoHold) {
            targetSpeed = this.creepSpeedR * this.speedMultiplier;
        } else {
            // P 檔或煞車中
            targetSpeed = 0;
        }

        const accelRate = (targetSpeed === 0) ? 12 : 6;
        this.speed += (targetSpeed - this.speed) * Math.min(1, dt * accelRate);
        if (Math.abs(this.speed) < 0.005) this.speed = 0;

        const steerRad = this.getFrontWheelSteerAngle();
        const dist = this.speed * dt;

        if (Math.abs(dist) > 0.0001) {
            const dHeading = (dist / this.wheelbase) * Math.tan(steerRad);
            this.heading += dHeading;

            this.x += dist * Math.sin(this.heading);
            this.z += dist * Math.cos(this.heading);

            if (this.trajectory.length === 0 || 
                Math.hypot(this.x - this.trajectory[this.trajectory.length - 1].x, 
                           this.z - this.trajectory[this.trajectory.length - 1].z) > 0.25) {
                this.trajectory.push({ x: this.x, z: this.z });
                if (this.trajectory.length > 500) this.trajectory.shift();
            }
        }
    }

    // 計算倒車時後輪動態預測引導線
    getReverseGuidelines(maxDist = 5.0, numSteps = 16) {
        const steerRad = this.getFrontWheelSteerAngle();
        const cosH = Math.cos(this.heading);
        const sinH = Math.sin(this.heading);
        const halfTrack = this.wheelTrack / 2;
        const rearDist = -this.wheelbase / 2;

        const leftPts = [];
        const rightPts = [];

        // 後輪中心世界坐標
        const rCenter = {
            x: this.x + rearDist * sinH,
            z: this.z + rearDist * cosH
        };

        if (Math.abs(steerRad) < 0.008) {
            // 直線倒車
            for (let i = 0; i <= numSteps; i++) {
                const d = - (maxDist * i / numSteps);
                const cx = rCenter.x + d * sinH;
                const cz = rCenter.z + d * cosH;
                leftPts.push({ x: cx - halfTrack * cosH, z: cz + halfTrack * sinH });
                rightPts.push({ x: cx + halfTrack * cosH, z: cz - halfTrack * sinH });
            }
        } else {
            // 曲線倒車 (繞 ICR 瞬心轉向)
            const R = this.wheelbase / Math.tan(steerRad);
            // 瞬心 ICR 坐標 (後軸右側為 +R 方向)
            const icrX = rCenter.x + R * cosH;
            const icrZ = rCenter.z - R * sinH;

            for (let i = 0; i <= numSteps; i++) {
                const s = - (maxDist * i / numSteps);
                const dTheta = s / R;
                const curH = this.heading + dTheta;
                const curCosH = Math.cos(curH);
                const curSinH = Math.sin(curH);

                const centerAtS = {
                    x: icrX - R * curCosH,
                    z: icrZ + R * curSinH
                };

                leftPts.push({
                    x: centerAtS.x - halfTrack * curCosH,
                    z: centerAtS.z + halfTrack * curSinH
                });
                rightPts.push({
                    x: centerAtS.x + halfTrack * curCosH,
                    z: centerAtS.z - halfTrack * curSinH
                });
            }
        }

        return { leftTrack: leftPts, rightTrack: rightPts };
    }

    getTireWorldPositions() {
        const cosH = Math.cos(this.heading);
        const sinH = Math.sin(this.heading);

        const halfTrack = this.wheelTrack / 2;
        const frontAxleDist = this.wheelbase / 2;
        const rearAxleDist = -this.wheelbase / 2;

        const toWorld = (localX, localZ) => {
            return {
                x: this.x + (localX * cosH + localZ * sinH),
                z: this.z + (-localX * sinH + localZ * cosH)
            };
        };

        return {
            fl: toWorld(-halfTrack, frontAxleDist),
            fr: toWorld(halfTrack, frontAxleDist),
            rl: toWorld(-halfTrack, rearAxleDist),
            rr: toWorld(halfTrack, rearAxleDist)
        };
    }

    getDoorHandlePositions() {
        const cosH = Math.cos(this.heading);
        const sinH = Math.sin(this.heading);
        const halfW = this.width / 2;
        const handleZ = 0.15;

        const toWorld = (localX, localZ) => {
            return {
                x: this.x + (localX * cosH + localZ * sinH),
                z: this.z + (-localX * sinH + localZ * cosH)
            };
        };

        return {
            leftHandle: toWorld(-halfW, handleZ),
            rightHandle: toWorld(halfW, handleZ)
        };
    }

    getDriverEyePosition() {
        const cosH = Math.cos(this.heading);
        const sinH = Math.sin(this.heading);
        const localX = -0.38;
        const localY = 1.18;
        const localZ = -0.35;

        return {
            x: this.x + (localX * cosH + localZ * sinH),
            y: localY,
            z: this.z + (-localX * sinH + localZ * cosH),
            heading: this.heading
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TrainerCar;
}
