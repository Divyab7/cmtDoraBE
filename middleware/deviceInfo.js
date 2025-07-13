const Device = require('../models/Device');
const { UserModel } = require('../models/User');

const deviceInfo = async (req, res, next) => {
  try {
    const deviceInfoHeader = req.headers['x-device-info'];
    
    if (!deviceInfoHeader) {
        return next();
    //   return res.status(400).json({ error: 'Device info header is required' });
    }

    let deviceData;
    try {
      deviceData = await JSON.parse(deviceInfoHeader);
    } catch (error) {
        return next();
    //   return res.status(400).json({ error: 'Invalid device info format' });
    }

    if (!deviceData || !deviceData?.deviceId) {
    //   return res.status(400).json({ error: 'Device ID is required' });
    return next();
    }

    // Find existing device or create new one
    let device = await Device.findOne({ deviceId: deviceData.deviceId });
    
    if (!device) {
      device = new Device({
        deviceId: deviceData.deviceId,
        platform: deviceData.platform || 'web', // Default to web if not specified
        user: req.user?.id // If user is authenticated
      });
    }

    // Update device information
    if (deviceData.expoPushToken) {
      device.expoPushToken = deviceData.expoPushToken;
    }
    
    if (req.user?.id) {
      device.user = req.user.id;
      
      // Add device to user's devices array if not already present
      const user = await UserModel.findById(req.user.id);
      if (user && !user.devices.includes(device._id)) {
        user.devices.push(device._id);
        await user.save();
      }
    }

    device.lastActive = new Date();
    await device.save();

    // Attach device to request object
    req.device = device;
    
    return next();
  } catch (error) {
    console.error('Device info middleware error:', error);
    return next();
    // return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = deviceInfo; 