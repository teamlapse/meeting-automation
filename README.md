# Zoom Meeting Creator GitHub Action

This GitHub Action allows you to create Zoom meetings directly from GitHub. Anyone can trigger the action to create a meeting using a specified Zoom account.

## Setup

1. Create a Zoom App in your Zoom Account:
   - Go to the [Zoom App Marketplace](https://marketplace.zoom.us/)
   - Click "Develop" → "Build App"
   - Choose "JWT" as the app type
   - Fill in the app information
   - Once created, note down the API Key and API Secret

2. Get your Zoom User ID:
   - Log in to your Zoom account
   - Your User ID can be found in your profile section

3. Add the following secrets to your GitHub repository:
   - Go to Settings → Secrets and Variables → Actions
   - Add the following secrets:
     - `ZOOM_API_KEY`: Your Zoom API Key
     - `ZOOM_API_SECRET`: Your Zoom API Secret
     - `ZOOM_USER_ID`: Your Zoom User ID

## Usage

You can create a meeting in two ways:

1. **Through GitHub UI:**
   - Go to the "Actions" tab in your repository
   - Select "Create Zoom Meeting" workflow
   - Click "Run workflow"
   - Fill in the required information:
     - Meeting Name
     - Date (YYYY-MM-DD)
     - Time (HH:MM in 24-hour format)
     - Duration (in minutes, default: 60)
     - Timezone (default: UTC)

2. **Through GitHub API:**
```bash
curl -X POST \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Authorization: token YOUR_GITHUB_TOKEN" \
  https://api.github.com/repos/OWNER/REPO/actions/workflows/create-zoom-meeting.yml/dispatches \
  -d '{
    "ref": "main",
    "inputs": {
      "meeting_name": "Team Meeting",
      "meeting_date": "2024-03-20",
      "meeting_time": "14:30",
      "duration": "60",
      "timezone": "America/New_York"
    }
  }'
```

## Output

The action will output:
- Meeting URL
- Meeting ID
- Meeting Password

These details will be available in the workflow run logs.

## Features

- Schedule meetings at any date and time
- Specify meeting duration
- Support for different timezones
- Automatic meeting password generation
- Join URL generation
- Host and participant video enabled by default
- Participants can join before host 