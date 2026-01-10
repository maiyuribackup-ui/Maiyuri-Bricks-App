<?php
$zipFile = 'deploy.zip';
$extractPath = './';

$zip = new ZipArchive;
if ($zip->open($zipFile) === TRUE) {
    if ($zip->extractTo($extractPath)) {
        echo "File unzipped successfully to $extractPath";
        // Optionally delete the zip file after extraction
        // unlink($zipFile);
    } else {
        echo "Failed to unzip file.";
    }
    $zip->close();
} else {
    echo "Failed to open zip file: $zipFile";
}
?>
