import json
import os
import tempfile

import mutagen
from django.contrib.auth import authenticate, login
from django.contrib.auth.decorators import login_required
from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from django.http import JsonResponse, HttpResponseForbidden, HttpResponseNotFound, FileResponse
from django.shortcuts import render, get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from mutagen.mp3 import MP3

from login.models import Device, Song, Playlist


# Create your views here.
def index(request):
    return render(request, 'index.html')


@csrf_exempt
def register(request):
    if request.method == 'POST':
        try:

            username = request.POST.get('username')
            password = request.POST.get('password')
            email = request.POST.get('email')

            if not username or len(username) < 3:
                return JsonResponse({'error': 'Username must be at least 3 characters long.'}, status=400)
            if not email or '@' not in email:
                return JsonResponse({'error': 'Invalid email address.'}, status=400)
            if not password or len(password) < 8:
                return JsonResponse({'error': 'Password must be at least 8 characters long.'}, status=400)

            # Check duplicates
            if User.objects.filter(username=username).exists():
                return JsonResponse({'error': 'Username already exists.'}, status=400)
            if User.objects.filter(email=email).exists():
                return JsonResponse({'error': 'Email already registered.'}, status=400)

            # Create user and device
            user = User.objects.create(
                username=username,
                password=make_password(password),
                email=email
            )

            return JsonResponse({
                'message': 'User registered successfully!',
            }, status=200)

        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON data.'}, status=400)
        except Exception as e:
            print(e)
            return JsonResponse({'error': f'An error occurred: {str(e)}'}, status=500)

    return render(request, 'register.html')


def user_login(request):
    if request.method == 'POST':
        email = request.POST.get('email')
        password = request.POST.get('password')

        # Validate input
        if not email or not password:
            return JsonResponse({'error': 'Both email and password are required.'}, status=400)
        username = User.objects.filter(email=email).first().username
        if not username:
            return JsonResponse({'error': 'Invalid email or password.'}, status=401)

        # Authenticate user
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)  # Log the user in
            return JsonResponse({'message': 'Login successful!'}, status=200)
        else:
            return JsonResponse({'error': 'Invalid email or password.'}, status=401)

    # For non-POST requests, render the login form
    return render(request, 'login.html')


@login_required
def dashboard(request, deviceId):
    # Fetch devices for the current user
    devices = Device.objects.filter(user=request.user).values(
        'id', 'name', 'os', 'device_type', 'last_connected'
    )

    # Format the devices for frontend use
    formatted_devices = []
    for device in devices:
        # Calculate time difference
        last_connected = device['last_connected']
        if last_connected:
            time_diff = timezone.now() - last_connected
            minutes = time_diff.total_seconds() / 60

            if minutes < 1:
                time_display = "Just now"
            elif minutes < 60:
                time_display = f"{int(minutes)} minutes ago"
            elif minutes < 1440:  # less than 24 hours
                hours = int(minutes / 60)
                time_display = f"{hours} hours ago"
            else:
                days = int(minutes / 1440)
                time_display = f"{days} days ago"
        else:
            time_display = "Never"

        device_id = str(device['id'])  # Convert UUID to string
        formatted_devices.append({
            'id': device_id,
            'name': device['name'],
            'os': device['os'],
            'device_type': device['device_type'],
            'last_connected_display': time_display,
            'is_current_device': device_id == deviceId
        })

    # Sort devices to put current device first
    formatted_devices.sort(key=lambda x: (not x['is_current_device'], x['last_connected_display']))

    context = {
        'devices': formatted_devices,
        'song_count': Song.objects.filter(uploaded_by=request.user, deleted=False).count(),
        'playlist_count': Playlist.objects.filter(owner=request.user).count(),
        'device_count': len(formatted_devices),
    }
    return render(request, 'bottom_nav.html', context)


def music_player(request):
    return render(request, 'musicplayer.html')


@login_required
def upload_song(request):
    if request.method != 'POST' or not request.FILES.get('file'):
        return JsonResponse({'error': 'Invalid request'}, status=400)

    file = request.FILES['file']
    device_id = request.POST.get('device_id')
    device = Device.objects.get(id=device_id)

    if not file.name.endswith(('.mp3', '.wav', '.m4a', '.aac')):
        return JsonResponse({'error': 'Invalid file format'}, status=400)

    if file.size > 20 * 1024 * 1024:
        return JsonResponse({'error': 'File too large'}, status=400)

    try:
        # Use os.path.join with sanitized filename
        safe_filename = os.path.basename(file.name)
        temp_file = os.path.join(tempfile.gettempdir(), safe_filename)

        with open(temp_file, 'wb+') as destination:
            for chunk in file.chunks():
                destination.write(chunk)

        audio = MP3(temp_file)
        title = audio.get('TIT2', [os.path.splitext(safe_filename)[0]])[0]
        artist = audio.get('TPE1', ['Unknown Artist'])[0]

        os.remove(temp_file)

        song = Song.objects.create(
            title=title,
            artist=artist,
            file=file,
            uploaded_from=device,
            uploaded_by=request.user,
            is_synced=True
        )

        return JsonResponse({
            'id': song.id,
            'title': song.title,
            'artist': song.artist,
            'uploaded_from__id': song.uploaded_from.id if song.uploaded_from else 'Unknown Device',
            'uploaded_from__name': song.uploaded_from.name if song.uploaded_from else 'Unknown Device',
            'uploaded_from__device_type': song.uploaded_from.device_type if song.uploaded_from else 'Unknown Device',
            'upload_date': song.upload_date.isoformat()
        })

    except mutagen.MutagenError as e:
        return JsonResponse({'error': f'Metadata extraction failed: {str(e)}'}, status=500)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def delete_song(request, song_id):
    try:
        song = Song.objects.get(id=song_id, uploaded_by=request.user)
        song.deleted = True
        song.deletion_date = timezone.now()
        song.save()
        return JsonResponse({'status': 'success'})
    except Song.DoesNotExist:
        return JsonResponse({'error': 'Song not found'}, status=404)


@login_required
def restore_song(request, song_id):
    try:
        song = Song.objects.get(id=song_id, uploaded_by=request.user, deleted=True)
        song.deleted = False
        song.deletion_date = None
        song.save()
        return JsonResponse({'status': 'success'})
    except Song.DoesNotExist:
        return JsonResponse({'error': 'Song not found'}, status=404)


@login_required
@csrf_exempt
def register_device(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)

            device = Device.objects.create(
                user=request.user,
                name=data['name'],
                os=data['os'],
                device_type=data['type'],
                is_active=True
            )
            device.save()

            response_data = {
                'device_id': str(device.id),
                'message': 'Device registered successfully'
            }
            return JsonResponse(response_data, status=200)

        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON data'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
@login_required
def delete_device(request, device_id):
    if request.method == 'POST':
        try:
            device = Device.objects.get(id=device_id, user=request.user)
            device.delete()
            return JsonResponse({'status': 'success'}, status=200)
        except Device.DoesNotExist:
            return JsonResponse({'error': 'Device not found'}, status=404)
    return JsonResponse({'error': 'Invalid request'}, status=400)


def playSong(request, song_id):
    song = get_object_or_404(Song, id=song_id)
    if song.deleted:
        return HttpResponseForbidden("This song has been deleted.")
    song.play_count += 1
    song.save()

    return render(request, 'musicplayer.html', {'song': song})


def fetch_song(request, song_id):
    # Fetch the song or return a 404 if not found
    song = get_object_or_404(Song, id=song_id)

    # Check if the song is marked as deleted
    if song.deleted:
        return HttpResponseForbidden("This song has been deleted.")

    # Increment the play count and save the song
    song.play_count += 1
    song.save()

    # Return song details as JSON response
    return JsonResponse({
        "id": song.id,
        "title": song.title,
        "artist": song.artist,
        "thumbnail": song.thumbnail,
        "play_count": song.play_count,
        "song_url": song.file.url,
        "upload_date": song.upload_date,
        "is_synced": song.is_synced,
    }, status=200)


@csrf_exempt
def check_deviceId(request):
    if request.method == 'POST':

        data = json.loads(request.body)
        device_id = data['device_id']
        device = Device.objects.filter(id=device_id, user=request.user).first()
        if device:
            return JsonResponse({'message': 'Device is available'}, status=200)
        else:
            return JsonResponse({'message': 'Device not found'}, status=404)
    return JsonResponse({'error': 'Method not allowed'}, status=405)


def download_song(request, song_id):
    try:
        # Get the song or return 404 if not found
        song = get_object_or_404(Song, id=song_id, deleted=False)

        # Check if file exists
        if song.file and song.file.storage.exists(song.file.name):
            response = FileResponse(song.file.open('rb'))
            response['Content-Type'] = 'audio/mpeg'
            # Use song title in Content-Disposition
            response['Content-Disposition'] = f'attachment; filename="{song.title}.mp3"'
            return response
        else:
            return HttpResponseNotFound('Song file not found')

    except Exception as e:
        return HttpResponseNotFound(str(e))
