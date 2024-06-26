const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const util = require('util');
const readFile = util.promisify(fs.readFile);

const PORT = 8080;

const app = express();
app.use(cors({
  origin: '*'
}));
app.use(bodyParser.json({ limit: '50mb' }));

app.listen(PORT, () => {
  console.log(`Server up on port ${PORT}`);
});

async function setDownloadBehavior(page, downloadPath) {
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadPath,
  });
}


async function waitForDownload(downloadDir) {
    while (true) {
        const files = fs.readdirSync(downloadDir);

        const completedFile = files.find(file => !file.endsWith('.crdownload'));
        if (completedFile) {
            return completedFile; // Return the first completed file found
        }

        console.log('Waiting for file to appear in download directory...');
        await new Promise(resolve => setTimeout(resolve, 30000)); // Wait for 30 seconds
    }
}    

const replacementImagePath = path.resolve(__dirname, 'design.png');

app.post('/get-mockup', async (req, res) => {
    let browser;
  try {
    console.log('We got requests');
    const { base64Image } = req.body;
    const buffer = Buffer.from(base64Image, 'base64');
    fs.writeFileSync(replacementImagePath, buffer); 

    const downloadDir = path.resolve(__dirname, 'downloads');
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir);
    }

    browser = await puppeteer.launch({
        userDataDir: path.resolve(__dirname, 'puppeteer_data'),
        timeout: 120000,
        protocolTimeout: 600000,
        headless: true,
        // executablePath: process.env.NODE_ENV === 'production' ? process.env.PUPPETERR_EXECUTABLE_PATH : puppeteer.executablePath(),
        args: [
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ],
    });
    console.log('Puppeteer is live')

    const newPage = await browser.newPage();
    newPage.setDefaultNavigationTimeout(900000);
    newPage.setDefaultTimeout(900000);
    console.log('New Page opened')
    await setDownloadBehavior(newPage, downloadDir);
    console.log('download behaivior set')



    // Navigate to the website
    await newPage.goto('https://mockcity.com/');
    console.log('Navigated to website')
    await newPage.waitForSelector('button.drop-btn.svelte-1yy602l')
    console.log('upload has appeared')


    // Upload the PSD file
    const [psdFileChooser] = await Promise.all([
        newPage.waitForFileChooser(),
        newPage.click('button.drop-btn.svelte-1yy602l')
    ])
    await psdFileChooser.accept(['new_hoodie_mockup.psd'])
    console.log('PSD Uploaded successfully')
    
    await newPage.waitForSelector('div.dropzone.relative.mockup-slot-dropzone.relative.z-10.border-4.rounded-xl.border-dashed.leading-tight.flex.justify-center.items-center.text-center.font-semibold.border-slate-500.bg-neutral-800.bg-opacity-\\[0\\.95\\].text-neutral-200.p-4.h-full')
    console.log('Design Uploader Has Apeared')

    //click upload btn
    const [designFileChooser] = await Promise.all([
        newPage.waitForFileChooser(),
        newPage.click('div.dropzone.relative.mockup-slot-dropzone.relative.z-10.border-4.rounded-xl.border-dashed.leading-tight.flex.justify-center.items-center.text-center.font-semibold.border-slate-500.bg-neutral-800.bg-opacity-\\[0\\.95\\].text-neutral-200.p-4.h-full')
    ])
    await designFileChooser.accept([replacementImagePath])
    
    await new Promise((resolve,_)=>{
        setTimeout(()=>{
            resolve()
        }, 10000)
    })
    console.log('Design Is Uploaded')

    // Click the generate button
    const generateButton = await newPage.waitForSelector('button.false.flex.justify-center.text-sm.items-center.gap-1.font-medium.px-2.py-1\\.5.bg-white.bg-opacity-10.hover\\:bg-opacity-20.transition.duration-100.rounded', {timeout: 0})
    console.log('Generate Button Active')
    await generateButton.click();

    await new Promise((resolve,_)=>{
        setTimeout(()=>{
            resolve()
        }, 10000)
    })
    
    // Wait for the download button and click it
    const downloadButton = await newPage.waitForSelector('svg.p-2.bg-gray-100.opacity-80.hover\\:opacity-100.shadow-lg.box-content.rounded.text-slate-900.fill-current', {timeout:0})
    console.log('Download Button Has Appeared')
    await downloadButton.click()
    console.log('Mockup Downloading Now')

    // Wait for the download to complete
    await new Promise((resolve,_)=>{
        setTimeout(()=>{
            resolve()
        }, 20000)
    })

    const downloadedFile = await waitForDownload(downloadDir);
    const downloadedFilePath = path.join(downloadDir, downloadedFile);
    console.log('File Retrieved:', downloadedFilePath);

    // Read the file
    const fileBuffer = await readFile(downloadedFilePath); // Read the file as a buffer
    const base64Data = fileBuffer.toString('base64'); // Convert the buffer to a base64 string
    console.log('File read and converted to base64');

    // Set appropriate headers and send the base64 data
    res.json({ base64Image: base64Data });
    console.log('Base64 data sent, holy barbanzo beans!!');

    // Cleanup: delete the downloaded file and design image
    fs.unlinkSync(downloadedFilePath);
    fs.unlinkSync(replacementImagePath)

  }catch (error) {
    console.error(error);
    res.status(500).send('Error downloading or sending the file.');
  }finally {
      if(browser){
        await browser.close()
      }
      if (fs.existsSync(replacementImagePath)) {
        fs.unlinkSync(replacementImagePath);
      }
    }
      
});