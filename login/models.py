import uuid

from django.contrib.auth.models import User
from django.db import models


class Device(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    os = models.CharField(max_length=100)
    device_type = models.CharField(max_length=50)  # mobile, desktop, tablet
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    last_connected = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} ({self.user.username})"

    class Meta:
        ordering = ['-last_connected']


class Song(models.Model):
    title = models.CharField(max_length=200)
    artist = models.CharField(max_length=200)
    thumbnail = models.CharField(max_length=200, blank=True, null=True)
    file = models.FileField(upload_to='songs/')
    uploaded_from = models.ForeignKey(Device, on_delete=models.SET_NULL, null=True)
    uploaded_by = models.ForeignKey(User, on_delete=models.CASCADE)
    upload_date = models.DateTimeField(auto_now_add=True)
    is_synced = models.BooleanField(default=False)
    play_count = models.IntegerField(default=0)
    deleted = models.BooleanField(default=False)
    deletion_date = models.DateTimeField(null=True, blank=True)


class Playlist(models.Model):
    name = models.CharField(max_length=200)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    songs = models.ManyToManyField(Song)
    created_at = models.DateTimeField(auto_now_add=True)
    is_private = models.BooleanField(default=False)


class Download(models.Model):
    song = models.ForeignKey(Song, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    device = models.ForeignKey(Device, on_delete=models.CASCADE)
    downloaded_at = models.DateTimeField(auto_now_add=True)
    is_available_offline = models.BooleanField(default=True)


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    offline_mode = models.BooleanField(default=False)
    high_quality_streaming = models.BooleanField(default=True)
    auto_sync = models.BooleanField(default=True)
    wifi_only = models.BooleanField(default=True)
    following = models.ManyToManyField('self', symmetrical=False)
