import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.utils import timezone

from login.models import Song, Device


class SongConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(args, kwargs)
        self.device_id = None

    async def connect(self):
        """Handle new WebSocket connection."""
        self.user = self.scope["user"]

        if not self.user.is_authenticated:
            await self.close()
            return

        self.room_group_name = f"user_songs_{self.user.id}"
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        """Handle WebSocket disconnection."""
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )
            if hasattr(self, 'device_id'):
                await self.update_device_status(False)

    async def receive(self, text_data):
        """Handle incoming WebSocket messages."""
        try:
            data = json.loads(text_data)
            message_type = data.get('type', '')

            if message_type == 'device_connect':
                device_id = data.get('device_id', '')
                if device_id:
                    self.device_id = device_id
                    await self.handle_device_connect(device_id)
                    songs = await self.get_user_songs()
                    await self.send(text_data=json.dumps({
                        'type': 'song_list',
                        'songs': songs
                    }, default=str))

            elif message_type == 'song_update':
                await self.handle_song_update(data)

            elif message_type == 'sync_status':
                await self.handle_sync_status(data)

        except json.JSONDecodeError:
            print("Invalid JSON received")
        except Exception as e:
            print(f"Error processing message: {e}")

    @database_sync_to_async
    def handle_device_connect(self, device_id):
        """Update existing device connection."""
        try:
            # Get user agent from headers
            user_agent = ''
            for header, value in self.scope['headers']:
                if header == b'user-agent':
                    user_agent = value.decode('utf-8')
                    break

            # Try to get the existing device
            device = Device.objects.get(id=device_id)

            # Update the device
            device.user = self.user
            device.browser = user_agent
            device.last_connected = timezone.now()
            device.is_active = True
            device.save()

            return device

        except Device.DoesNotExist:
            # Handle case where device doesn't exist
            return None

    @database_sync_to_async
    def update_device_status(self, is_connected):
        """Update device connection status."""
        if hasattr(self, 'device_id'):
            Device.objects.filter(id=self.device_id).update(
                last_connected=timezone.now() if is_connected else None,
                is_active=is_connected
            )

    async def handle_song_update(self, data):
        """Process song updates and broadcast to all user devices."""
        action = data.get('action', '')
        song_data = data.get('song', {})
        source_device = data.get('source_device', '')

        if action and song_data:
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'broadcast_song_update',
                    'action': action,
                    'song': song_data,
                    'source_device': source_device
                }
            )

    async def handle_sync_status(self, data):
        """Handle song sync status updates."""
        song_id = data.get('song_id')
        synced_devices = data.get('synced_devices', [])

        if song_id:
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'broadcast_sync_status',
                    'song_id': song_id,
                    'synced_devices': synced_devices
                }
            )

    async def broadcast_song_update(self, event):
        """Send song update to WebSocket."""
        await self.send(text_data=json.dumps({
            'type': 'song_update',
            'action': event['action'],
            'song': event['song'],
            'source_device': event['source_device']
        }))

    async def broadcast_sync_status(self, event):
        """Send sync status update to WebSocket."""
        await self.send(text_data=json.dumps({
            'type': 'sync_status',
            'song_id': event['song_id'],
            'synced_devices': event['synced_devices']
        }))

    @database_sync_to_async
    def get_user_songs(self):
        """Get all songs for the current user."""
        return list(Song.objects.filter(
            uploaded_by=self.user,
            deleted=False
        ).values(
            'id', 'title', 'artist', 'upload_date',
            'is_synced', 'uploaded_from__name', 'uploaded_from__id', 'uploaded_from__device_type'
        ).order_by('-upload_date'))
