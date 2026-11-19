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
        this.gear = 'D'; // 'D' (前進) 或 'R' (倒退)
        this.isBraking = false;
        this.speed = 0;

        this.creepSpeedD = 1.15;
        this.creepSpeedR = -0.95;

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
        if (gear === 'D' || gear === 'R') {
            this.gear = gear;
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
        if (!this.isBraking) {
            targetSpeed = (this.gear === 'D') ? this.creepSpeedD : this.creepSpeedR;
        }

        this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 6);

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
