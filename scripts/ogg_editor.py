import os
import subprocess
import tkinter as tk
from tkinter import filedialog, messagebox
from tkinterdnd2 import DND_FILES, TkinterDnD
import json

def get_audio_info(file_path):
    try:
        ffprobe_cmd = [
            "C:\\Users\\erwin\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-7.1.1-full_build\\bin\\ffprobe.exe",
            "-v", "error",
            "-select_streams", "a:0",
            "-show_entries", "stream=bit_rate,sample_rate,channels",
            "-of", "json",
            file_path
        ]
        result = subprocess.run(ffprobe_cmd, capture_output=True, text=True)
        data = json.loads(result.stdout)
        stream = data['streams'][0]
        bitrate = int(stream.get('bit_rate', 0)) // 1000  # en kbps
        sample_rate = int(stream.get('sample_rate', 0)) // 1000  # en kHz
        channels = int(stream.get('channels', 0))
        return bitrate, sample_rate, channels
    except Exception as e:
        log(f"Erreur lors de la récupération des infos audio : {e}")
        return None, None, None

def update_audio_info_display(file_path):
    bitrate, sample_rate, channels = get_audio_info(file_path)
    if bitrate is not None and sample_rate is not None and channels is not None:
        channel_text = "Mono" if channels == 1 else "Stéréo" if channels == 2 else f"{channels} canaux"
        label_audio_info.config(text=f"Bitrate actuel : {bitrate} kbps | Sample Rate actuel : {sample_rate} kHz | {channel_text}")
    else:
        label_audio_info.config(text="Impossible de récupérer les informations audio")

def log(message):
    with open("compressor_log.txt", "a") as log_file:
        log_file.write(message + "\n")
    print(message)

def compress_audio(input_file, output_file, bitrate, sample_rate, monoStereoMode, use_opus):
    try:
        log(f"Début de la compression : {input_file}")
        codec = "libopus" if use_opus else "libvorbis"
        extra_options = []
        
        if sample_rate:
            extra_options += ["-ar", str(sample_rate)]
        if monoStereoMode == "mono":
            extra_options += ["-ac", "1"]
        elif monoStereoMode == "stereo":
            extra_options += ["-ac", "2"]
        
        opus_options = []
        if use_opus:
            opus_options = ["-vbr", "on", "-compression_level", "10"]
        
        # ffmpeg may be replaced with the path to your ffmpeg executable
        command = [
            "C:\\Users\\erwin\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-7.1.1-full_build\\bin\\ffmpeg.exe",
            "-i", input_file,
            "-map_metadata", "-1",  # <-- suppression des métadonnées
            "-c:a", codec,
            "-b:a", bitrate,
            "-af", "lowpass=f=16000",
            *extra_options,
            *opus_options,
            output_file
        ]
        log(f"Commande exécutée : {' '.join(command)}")
        subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        original_size = os.path.getsize(input_file) / 1024
        compressed_size = os.path.getsize(output_file) / 1024
        log(f"Compression terminée : {input_file} -> {output_file}")
        log(f"Taille initiale : {original_size:.2f} KB | Taille compressée : {compressed_size:.2f} KB")
        messagebox.showinfo("Compression terminée", f"Taille initiale : {original_size:.2f} KB\nTaille compressée : {compressed_size:.2f} KB")
    except Exception as e:
        log(f"Erreur lors de la compression : {str(e)}")
        messagebox.showerror("Erreur", f"Une erreur s'est produite : {str(e)}")

def select_file():
    try:
        file_path = filedialog.askopenfilename(filetypes=[("Fichiers OGG", "*.ogg")])
        if file_path:
            entry_file.delete(0, tk.END)
            entry_file.insert(0, file_path)
            log(f"Fichier sélectionné : {file_path}")
            update_audio_info_display(file_path)
    except Exception as e:
        log(f"Erreur lors de la sélection du fichier : {str(e)}")

def drop_file(event):
    try:
        file_path = event.data.strip()
        if file_path.startswith('{') and file_path.endswith('}'):
            file_path = file_path[1:-1]
        entry_file.delete(0, tk.END)
        entry_file.insert(0, file_path)
        log(f"Fichier déposé : {file_path}")
        update_audio_info_display(file_path)
    except Exception as e:
        log(f"Erreur lors du drag & drop : {str(e)}")

def start_compression():
    try:
        input_file = entry_file.get()
        if not input_file:
            messagebox.showerror("Erreur", "Veuillez sélectionner un fichier OGG")
            log("Erreur : Aucun fichier sélectionné")
            return
        
        output_file = input_file.replace(".ogg", "_compressed.ogg")
        bitrate = bitrate_var.get() + "k"
        sample_rate = 22050 if sample_rate_var.get() else None
        monoStereoMode = mono_mode_var.get()
        use_opus = opus_var.get()
        
        log(f"Début de la compression avec paramètres : Bitrate={bitrate}, SampleRate={sample_rate}, Mono/Stereo mode={monoStereoMode}, Opus={use_opus}")
        compress_audio(input_file, output_file, bitrate, sample_rate, monoStereoMode, use_opus)
    except Exception as e:
        log(f"Erreur dans start_compression : {str(e)}")

# Interface TkinterDnD
root = TkinterDnD.Tk()
root.title("Compresseur OGG")

frame = tk.Frame(root, padx=10, pady=10)
frame.pack()

tk.Label(frame, text="Fichier OGG :").grid(row=0, column=0)
entry_file = tk.Entry(frame, width=40)
entry_file.grid(row=0, column=1)
tk.Button(frame, text="Parcourir", command=select_file).grid(row=0, column=2)

entry_file.drop_target_register(DND_FILES)
entry_file.dnd_bind('<<Drop>>', drop_file)

label_audio_info = tk.Label(frame, text="Bitrate: - kbps | Sample Rate: - kHz")
label_audio_info.grid(row=6, column=0, columnspan=3, pady=(10,0))

bitrate_var = tk.StringVar(value="64")
tk.Label(frame, text="Bitrate (kbps) :").grid(row=1, column=0)
tk.Entry(frame, textvariable=bitrate_var, width=5).grid(row=1, column=1)

sample_rate_var = tk.BooleanVar()
tk.Checkbutton(frame, text="Réduire à 22.05 kHz", variable=sample_rate_var).grid(row=2, column=0, columnspan=2)

mono_mode_var = tk.StringVar(value="stereo")
tk.Label(frame, text="Canaux audio :").grid(row=3, column=0, sticky="w")
tk.OptionMenu(frame, mono_mode_var, "mono", "stereo").grid(row=3, column=1, sticky="w")

opus_var = tk.BooleanVar()
tk.Checkbutton(frame, text="Utiliser Opus (au lieu de Vorbis)", variable=opus_var).grid(row=4, column=0, columnspan=2)

tk.Button(frame, text="Compresser", command=start_compression).grid(row=5, column=0, columnspan=3, pady=10)

log("Lancement de l'application")
root.mainloop()