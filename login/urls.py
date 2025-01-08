from django.urls import path
from django.views.generic import TemplateView

from login import views

urlpatterns = [
    path('', views.index, name='index'),
    path('register/', views.register, name='register'),
    path('login/', views.user_login, name='login'),
    path('dashboard/<str:deviceId>/', views.dashboard, name='dashboard'),
    path('music_player/', views.music_player, name='musicPlayer'),
    path('register_device/', views.register_device, name='registerDevice'),
    path('upload_song/', views.upload_song, name='upload_song'),
    path('songs/<int:song_id>/delete/', views.delete_song, name='delete_song'),
    path('download_song/<int:song_id>/', views.download_song, name='download_song'),
    path('songs/<int:song_id>/restore/', views.restore_song, name='restore_song'),
    path('delete-device/<str:device_id>/', views.delete_device, name='delete_device'),
    path('play-song/<int:song_id>/', views.playSong, name='playSong'),
    path('fetch-song/<int:song_id>/', views.fetch_song, name='fetchSong'),
    path('check-deviceId/', views.check_deviceId, name='check_deviceId'),
    path('service-worker.js',
         TemplateView.as_view(
             template_name="service-worker.js",
             content_type="application/javascript",
         ),
         name='service-worker.js'),

]
