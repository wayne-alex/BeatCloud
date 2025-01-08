# login/routing.py
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/songs/$', consumers.SongConsumer.as_asgi()),
]