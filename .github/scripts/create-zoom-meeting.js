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

// Validate credentials
function validateCredentials() {
    const missing = [];
    if (!ZOOM_ACCOUNT_ID) missing.push('ZOOM_ACCOUNT_ID');
    if (!ZOOM_CLIENT_ID) missing.push('ZOOM_CLIENT_ID');
    if (!ZOOM_CLIENT_SECRET) missing.push('ZOOM_CLIENT_SECRET');
    if (!ZOOM_USER_EMAIL) missing.push('ZOOM_USER_EMAIL');

    if (missing.length > 0) {
        throw new Error(`Missing required credentials: ${missing.join(', ')}`);
    }

    // Log partial credentials for debugging (safely)
    console.log('Credentials check:');
    console.log('Account ID:', `${ZOOM_ACCOUNT_ID.slice(0, 4)}...`);
    console.log('Client ID:', `${ZOOM_CLIENT_ID.slice(0, 4)}...`);
    console.log('Client Secret length:', ZOOM_CLIENT_SECRET.length);
    console.log('User Email:', ZOOM_USER_EMAIL);
}

// Get OAuth access token
async function getAccessToken() {
    try {
        validateCredentials();

        const authString = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
        console.log('Making token request to Zoom...');

        const tokenResponse = await axios({
            method: 'post',
            url: 'https://zoom.us/oauth/token',
            params: {
                grant_type: 'account_credentials',
                account_id: ZOOM_ACCOUNT_ID
            },
            headers: {
                'Authorization': `Basic ${authString}`
            }
        });

        if (!tokenResponse.data || !tokenResponse.data.access_token) {
            throw new Error('No access token received in response');
        }

        return tokenResponse.data.access_token;
    } catch (error) {
        if (error.response && error.response.data) {
            console.error('Zoom API Error Details:', error.response.data);
        }
        throw error;
    }
}

// Get user ID from email
async function getUserId(accessToken) {
    try {
        // First try to get user directly
        const userResponse = await axios({
            method: 'get',
            url: `https://api.zoom.us/v2/users/${ZOOM_USER_EMAIL}`,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        return userResponse.data.id;
    } catch (error) {
        // If direct lookup fails, try listing users
        if (error.response && error.response.data && error.response.data.code === 1001) {
            console.log('User not found directly, searching in user list...');
            const listResponse = await axios({
                method: 'get',
                url: 'https://api.zoom.us/v2/users',
                params: {
                    status: 'active',
                    page_size: 100
                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const user = listResponse.data.users.find(u =>
                u.email.toLowerCase() === ZOOM_USER_EMAIL.toLowerCase()
            );

            if (!user) {
                throw new Error(`User with email ${ZOOM_USER_EMAIL} not found in account. Available users: ${listResponse.data.users.map(u => u.email).join(', ')}`);
            }

            return user.id;
        }
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

// Register attendees using the registrants API
async function registerAttendees(accessToken, meetingId, attendeesList) {
    try {
        console.log('Registering attendees...');
        const registrationPromises = attendeesList.map(email => {
            return axios({
                method: 'post',
                url: `https://api.zoom.us/v2/meetings/${meetingId}/registrants`,
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                data: {
                    email: email,
                    first_name: email.split('@')[0], // Use part before @ as first name
                    auto_approve: true
                }
            });
        });

        await Promise.all(registrationPromises);
        console.log('Successfully registered all attendees');
    } catch (error) {
        console.error('Failed to register attendees:', error.response && error.response.data ? error.response.data : error.message);
        throw error;
    }
}

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

        // Get user ID
        const userId = await getUserId(accessToken);
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
                type: 2,
                start_time: meetingDateTime.format('YYYY-MM-DDTHH:mm:ss'),
                duration: parseInt(DURATION),
                timezone: TIMEZONE,
                agenda: `Join URL: ${MEETING_NAME}\n\nThis is a Zoom meeting created via GitHub Actions.`,
                settings: {
                    host_video: true,
                    participant_video: true,
                    join_before_host: true,
                    mute_upon_entry: false,
                    waiting_room: false,
                    approval_type: 2, // Auto approve registrants
                    registration_type: 2, // Required registration
                    registrants_email_notification: true,
                    registrants_confirmation_email: true,
                    push_change_to_calendar: true
                }
            }
        });

        const meetingDetails = response.data;
        console.log('Meeting created successfully!');
        console.log('Meeting Link:', meetingDetails.join_url);
        console.log('Meeting ID:', meetingDetails.id);
        console.log('Meeting Password:', meetingDetails.password);
        console.log('Meeting Time (London):', meetingDateTime.format('DD-MM-YYYY HH:mm'));

        // Register attendees using the registrants API
        if (attendeesList.length > 0) {
            console.log('Registering attendees...');
            await registerAttendees(accessToken, meetingDetails.id, attendeesList);
            console.log('Attendees registered successfully');
        }

        // Set the outputs using the new $GITHUB_OUTPUT environment file
        if (GITHUB_OUTPUT) {
            fs.appendFileSync(GITHUB_OUTPUT, `meeting_url=${meetingDetails.join_url}\n`);
            fs.appendFileSync(GITHUB_OUTPUT, `meeting_id=${meetingDetails.id}\n`);
        }
    } catch (error) {
        if (error.response && error.response.data) {
            console.error('Error:', error.response.data);
        } else {
            console.error('Error:', error.message);
        }
        process.exit(1);
    }
}

createZoomMeeting();