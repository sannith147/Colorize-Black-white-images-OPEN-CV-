import os
import base64
import io
import numpy as np
import cv2 as cv
from flask import Flask, render_template, request, jsonify, send_from_directory

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models")
PROTOTXT = os.path.join(MODEL_DIR, "colorization_deploy_v2.prototxt")
CAFFEMODEL = os.path.join(MODEL_DIR, "colorization_release_v2.caffemodel")
PTS_FILE = os.path.join(BASE_DIR, "pts_in_hull.npy")

caffe_net = None

def load_model():
    global caffe_net
    if caffe_net is None:
        if not os.path.exists(CAFFEMODEL):
            raise FileNotFoundError("Caffe model weights file missing. Downloading in progress...")
        numpy_file = np.load(PTS_FILE)
        net = cv.dnn.readNetFromCaffe(PROTOTXT, CAFFEMODEL)
        numpy_file = numpy_file.transpose().reshape(2, 313, 1, 1)
        net.getLayer(net.getLayerId('class8_ab')).blobs = [numpy_file.astype(np.float32)]
        net.getLayer(net.getLayerId('conv8_313_rh')).blobs = [np.full([1, 313], 2.606, np.float32)]
        caffe_net = net
    return caffe_net

def colorize_image(img_bgr):
    net = load_model()
    
    rgb_img = (img_bgr[:, :, [2, 1, 0]] * 1.0 / 255.0).astype(np.float32)
    lab_img = cv.cvtColor(rgb_img, cv.COLOR_RGB2Lab)
    l_channel = lab_img[:, :, 0]
    
    input_width = 224
    input_height = 224
    l_channel_resize = cv.resize(l_channel, (input_width, input_height))
    l_channel_resize -= 50
    
    net.setInput(cv.dnn.blobFromImage(l_channel_resize))
    ab_channel = net.forward()[0, :, :, :].transpose((1, 2, 0))
    
    original_height, original_width = rgb_img.shape[:2]
    ab_channel_us = cv.resize(ab_channel, (original_width, original_height))
    lab_output = np.concatenate((l_channel[:, :, np.newaxis], ab_channel_us), axis=2)
    bgr_output = np.clip(cv.cvtColor(lab_output, cv.COLOR_Lab2BGR), 0, 1)
    
    return (bgr_output * 255).astype(np.uint8)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/status')
def status():
    model_ready = os.path.exists(CAFFEMODEL) and os.path.getsize(CAFFEMODEL) > 100000000
    size_mb = round(os.path.getsize(CAFFEMODEL) / (1024*1024), 2) if os.path.exists(CAFFEMODEL) else 0
    return jsonify({
        'model_ready': model_ready,
        'model_size_mb': size_mb
    })

@app.route('/api/samples')
def list_samples():
    candidates = ['new.jpg', 'input.png', 'image.jpg', 'new1.jpg', 'image other.jpg']
    samples = []
    for filename in candidates:
        filepath = os.path.join(BASE_DIR, filename)
        if os.path.exists(filepath):
            samples.append({
                'name': filename,
                'url': f'/sample/{filename}'
            })
    return jsonify({'samples': samples})

@app.route('/sample/<filename>')
def get_sample(filename):
    return send_from_directory(BASE_DIR, filename)

@app.route('/api/colorize', methods=['POST'])
def handle_colorize():
    try:
        if 'image' in request.files:
            file = request.files['image']
            in_memory_file = io.BytesIO()
            file.save(in_memory_file)
            data = np.frombuffer(in_memory_file.getvalue(), dtype=np.uint8)
            img = cv.imdecode(data, cv.IMREAD_COLOR)
        elif request.is_json and 'sample' in request.json:
            sample_name = request.json['sample']
            sample_path = os.path.join(BASE_DIR, sample_name)
            img = cv.imread(sample_path)
        else:
            return jsonify({'error': 'No image provided'}), 400
            
        if img is None:
            return jsonify({'error': 'Failed to decode image'}), 400
            
        gray_img = cv.cvtColor(img, cv.COLOR_BGR2GRAY)
        gray_bgr = cv.cvtColor(gray_img, cv.COLOR_GRAY2BGR)
        
        colorized_bgr = colorize_image(gray_bgr)
        
        _, orig_buf = cv.imencode('.jpg', gray_bgr)
        orig_b64 = base64.b64encode(orig_buf).decode('utf-8')
        
        _, color_buf = cv.imencode('.jpg', colorized_bgr)
        color_b64 = base64.b64encode(color_buf).decode('utf-8')
        
        return jsonify({
            'success': True,
            'original': f'data:image/jpeg;base64,{orig_b64}',
            'colorized': f'data:image/jpeg;base64,{color_b64}',
            'width': img.shape[1],
            'height': img.shape[0]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("Starting Colorize Web Server on http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=False)
