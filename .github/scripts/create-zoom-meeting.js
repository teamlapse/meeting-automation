const axios = require('axios');
const moment = require('moment-timezone');
const fs = require('fs');

// Get environment variables
const {
    ZOOM_ACCOUNT_ID,
    ZOOM_CLIENT_ID,
    ZOOM_CLIENT_SECRET,
    ZOOM_USER_EMAIL,
    MEETING_NAME,
    MEETING_DATE,
    MEETING_TIME,
    DURATION,
    ATTENDEES,
    GITHUB_OUTPUT
} = process.env;

// London timezone
const TIMEZONE = 'Europe/London';

// Get OAuth access token
async function getAccessToken() {
    try {
        const tokenResponse = await axios({
                    method: 'post',
                    url: 'https://zoom.us/oauth/token',
                    params: {
                        grant_type: 'account_credentials',
                        account_id: ZOOM_ACCOUNT_ID
                    },
                    headers: {
                        'Authorization': `Basic ${Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64')}`
            }
        });

        return tokenResponse.data.access_token;
    } catch (error) {
        console.error('Error getting access token:', error.response?.data || error.message);
        throw error;
    }
}

// Parse attendees string into array
const parseAttendees = (attendeesString) => {
    if (!attendeesString) return [];
    return attendeesString.split(',')
        .map(email => email.trim())
        .filter(email => email.length > 0);
};

// Validate and parse date
const parseDate = (dateStr) => {
    // Try to parse the date in DD-MM-YYYY format
    const date = moment(dateStr, 'DD-MM-YYYY', true);
    if (!date.isValid()) {
        throw new Error('Invalid date format. Please use DD-MM-YYYY format (e.g., 16-05-2025)');
    }
    return date;
};

// Create Zoom meeting
async function createZoomMeeting() {
    try {
        // Get access token
        const accessToken = await getAccessToken();
        console.log('Successfully obtained access token');

        // Parse and validate the date
        const date = parseDate(MEETING_DATE);
        
        // Combine date and time
        const meetingDateTime = moment.tz(`${date.format('YYYY-MM-DD')} ${MEETING_TIME}`, 'YYYY-MM-DD HH:mm', TIMEZONE);
        const attendeesList = parseAttendees(ATTENDEES);

        // Additional validation
        if (!meetingDateTime.isValid()) {
            throw new Error('Invalid meeting time format');
        }

        // Verify the meeting is in the future
        if (meetingDateTime.isBefore(moment())) {
            throw new Error('Meeting time must be in the future');
        }

        // First, get the user ID from email
        const userResponse = await axios({
            method: 'get',
            url: `https://api.zoom.us/v2/users/${ZOOM_USER_EMAIL}`,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        const userId = userResponse.data.id;
        console.log('Successfully retrieved user ID');

        const response = await axios({
            method: 'post',
            url: `https://api.zoom.us/v2/users/${userId}/meetings`,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
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
                    waiting_room: false,
                    registrants_email_notification: true
                }
            }
        });

        const meetingDetails = response.data;
        console.log('Meeting created successfully!');
        console.log('Meeting Link:', meetingDetails.join_url);
        console.log('Meeting ID:', meetingDetails.id);
        console.log('Meeting Password:', meetingDetails.password);
        console.log('Meeting Time (London):', meetingDateTime.format('DD-MM-YYYY HH:mm'));

        // If there are attendees, add them to the meeting
        if (attendeesList.length > 0) {
            console.log('Adding attendees to the meeting...');
            const attendeePromises = attendeesList.map(email =>
                axios({
                    method: 'post',
                    url: `https://api.zoom.us/v2/meetings/${meetingDetails.id}/registrants`,
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    data: {
                        email: email,
                        first_name: email.split('@')[0], // Use part before @ as first name
                        auto_approve: true
                    }
                })
            );

            await Promise.all(attendeePromises);
            console.log('Successfully added attendees to the meeting');
        }

        // Set the outputs using the new $GITHUB_OUTPUT environment file
        if (GITHUB_OUTPUT) {
            fs.appendFileSync(GITHUB_OUTPUT, `meeting_url=${meetingDetails.join_url}\n`);
            fs.appendFileSync(GITHUB_OUTPUT, `meeting_id=${meetingDetails.id}\n`);
        }
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        process.exit(1);
    }
}

createZoomMeeting();