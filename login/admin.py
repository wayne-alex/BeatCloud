from django.contrib import admin

# Register your models here.
from .models import *

admin.site.register(Device)
admin.site.register(Song)
admin.site.register(Playlist)
admin.site.register(UserProfile)
admin.site.register(Download)