from pydub import AudioSegment
from pydub.effects import low_pass_filter, high_pass_filter

# Load the OGG file
audio = AudioSegment.from_file("./original.ogg", format="ogg")

# Apply high pass filter
audio = high_pass_filter(audio, cutoff=300.0)

# Apply low pass filter
audio = low_pass_filter(audio, cutoff=3000.0)

# Reduce the bit rate to simulate old radio quality
audio = audio.set_frame_rate(11025).set_sample_width(1).set_channels(1)

# Export the modified audio
audio.export("./test.ogg", format="ogg")