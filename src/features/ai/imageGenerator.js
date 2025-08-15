import axios from 'axios';

export async function generateImage(prompt) {
    console.log("Attempting to call Go microservice for image generation...");
    try {
        const response = await axios.post('http://localhost:8080/generate', { prompt });
        console.log("Go service responded with:", response.status, response.data);
        return response.data.imageUrls;
    } catch (error) {
        console.error('Failed to get custom image from Go service:', error.message);
        return null;
    }
}
