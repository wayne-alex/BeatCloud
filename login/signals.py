from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Song


@receiver(post_save, sender=Song)
def song_saved(sender, instance, created, **kwargs):
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        "songs",
        {
            "type": "song_update",
            "action": "create" if created else "update",
            "song": {
                "id": instance.id,
                "title": instance.title,
                "artist": instance.artist,
                "upload_date": instance.upload_date.isoformat(),
                "is_synced": instance.is_synced,
                "uploaded_from": instance.uploaded_from.name if instance.uploaded_from else "Unknown Device"
            }
        }
    )
