'''
Process:
1. get camera position
	from onvif import ONVIFCamera
	import asyncio
	
	async def get_ptz_coords(ip, port, user, password):
		# Ensure WSDL files are available (onvif-python typically handles this, 
		# but python-onvif-zeep might require a specific path)
		cam = ONVIFCamera(ip, port, user, password)
		
		# Create PTZ service and get profile
		await cam.update_xaddrs()
		ptz_service = cam.create_ptz_service()
		media_service = cam.create_media_service()
		profiles = await media_service.GetProfiles()
		profile_token = profiles[0].token
	
		# Get the status object which contains the position
		status = await ptz_service.GetStatus({'ProfileToken': profile_token})
		
		if status and status.Position:
			pan = status.Position.PanTilt.x
			tilt = status.Position.PanTilt.y
			zoom = status.Position.Zoom.x
			print(f"Current position: Pan={pan}, Tilt={tilt}, Zoom={zoom}")
		else:
			# Note: some cameras always return None for GetStatus position
			print("Could not retrieve position or camera does not support it.")
	
	# To run the async function:
	# asyncio.run(get_ptz_coords('192.168.0.2', 80, 'admin', 'password')) 

2. perform absolute move ()
	async def set_ptz_coords(ip, port, user, password, pan, tilt, zoom):
		cam = ONVIFCamera(ip, port, user, password)
		await cam.update_xaddrs()
		ptz_service = cam.create_ptz_service()
		media_service = cam.create_media_service()
		profiles = await media_service.GetProfiles()
		profile_token = profiles[0].token
	
		# Create the PTZ move request object
		request = ptz_service.create_type('AbsoluteMove')
		request.ProfileToken = profile_token
		
		# Set the target coordinates (e.g., pan=0.5, tilt=-0.5, zoom=0)
		request.Position = {'PanTilt': {'x': pan, 'y': tilt, 'space': ''}, 
							'Zoom': {'x': zoom, 'space': ''}}
		
		# Optional: set the speed
		request.Speed = {'PanTilt': {'x': 0.5, 'y': 0.5, 'space': ''}, 
						 'Zoom': {'x': 0.5, 'space': ''}} # Values also typically in [-1, 1]
	
		# Send the move command
		await ptz_service.AbsoluteMove(request)
		print(f"Moving to Pan={pan}, Tilt={tilt}, Zoom={zoom}")
	
	# To run the async function:
	# asyncio.run(set_ptz_coords('192.168.0.2', 80, 'admin', 'password', 0.5, -0.5, 0))

3. scan for aruco
	
4. if present, center the codes
5. if not, move again
'''