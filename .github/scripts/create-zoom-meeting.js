const jwt = require('jsonwebtoken');
const axios = require('axios');
const moment = require('moment');
const fs = require('fs');

// Get environment variables
const {
    ZOOM_API_KEY,
    ZOOM_API_SECRET,
    ZOOM_USER_ID,
    MEETING_NAME,
    MEETING_DATE,
    MEETING_TIME,
    DURATION,
    TIMEZONE,
    GITHUB_OUTPUT
} = process.env;

// Generate JWT token for Zoom API authentication
const generateToken = () => {
    const payload = {
        iss: ZOOM_API_KEY,
        exp: Math.floor(Date.now() / 1000) + 60 * 60, // Token expires in 1 hour
    };
    return jwt.sign(payload, ZOOM_API_SECRET);
};

// Create Zoom meeting
async function createZoomMeeting() {
    try {
        // Format the meeting time
        const meetingDateTime = moment.tz(`${MEETING_DATE} ${MEETING_TIME}`, TIMEZONE);

        const token = generateToken();
        const response = await axios({
            method: 'post',
            url: `https://api.zoom.us/v2/users/${ZOOM_USER_ID}/meetings`,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            data: {
                topic: MEETING_NAME,
                type: 2, // Scheduled meeting
                start_time: meetingDateTime.format(),
                duration: parseInt(DURATION),
                timezone: TIMEZONE,
                settings: {
                    host_video: true,
                    participant_video: true,
                    join_before_host: true,
                    mute_upon_entry: false,
                    waiting_room: false
                }
            }
        });

        const meetingDetails = response.data;
        console.log('Meeting created successfully!');
        console.log('Meeting Link:', meetingDetails.join_url);
        console.log('Meeting ID:', meetingDetails.id);
        console.log('Meeting Password:', meetingDetails.password);

        // Set the outputs using the new $GITHUB_OUTPUT environment file
        if (GITHUB_OUTPUT) {
            fs.appendFileSync(GITHUB_OUTPUT, `meeting_url=${meetingDetails.join_url}\n`);
            fs.appendFileSync(GITHUB_OUTPUT, `meeting_id=${meetingDetails.id}\n`);
        }
    } catch (error) {
        console.error('Error creating Zoom meeting:', error.response && error.response.data || error.message);
        process.exit(1);
    }
}

createZoomMeeting();