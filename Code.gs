/**
 * @file Code.gs
 * @description Server-side logic for the Online Lesson Plan Submission System.
 * @author Mr.Boonchai Boonsopon (Developed with an AI Coding Partner)
 * @version 1.0.0
 */

// ----- GLOBAL CONSTANTS -----
const SPREADSHEET_ID = '15CBB7Jq4IFEVe8DYORoI42cj3w8DTNIAZMyz7NSdbXM';
const PROFILE_PICS_FOLDER_ID = '1Fv4J7bS5gGOhrcOebgv2QiUpi6XFbOoA';
const LESSON_PLANS_FOLDER_ID = '1sjYVktsmw-3gF570ElYrRaVNMBSXmORx';

const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
const regSheet = ss.getSheetByName('ลงทะเบียน');
const planSheet = ss.getSheetByName('ข้อมูลแผนการสอน');
const subjectSheet = ss.getSheetByName('ข้อมูลวิชา');
const notificationSheet = ss.getSheetByName('แจ้งเตือน');
const logSheet = ss.getSheetByName('Activity_Log');

// ----- WEB APP SERVING -----

/**
 * Main function to serve the web application.
 * Routes users to the correct page.
 * @param {object} e The event parameter.
 * @returns {HtmlOutput} The HTML page to display.
 */
function doGet(e) {
  // ใช้ e.parameter.page เพื่อดูว่าผู้ใช้ขอหน้าอะไรมา, ถ้าไม่ระบุให้ไปหน้า Index
  const page = e.parameter.page || 'Index'; 
  let htmlOutput;

  // ตรวจสอบว่ามี case ครบทุกหน้าหรือไม่
  switch (page) {
    case 'Index':
      htmlOutput = HtmlService.createTemplateFromFile('Index').evaluate();
      break;
    case 'Registration':
      htmlOutput = HtmlService.createTemplateFromFile('Registration').evaluate();
      break;
    case 'Dashboard':
      htmlOutput = HtmlService.createTemplateFromFile('Dashboard').evaluate();
      break;
    case 'SubmissionForm':
      htmlOutput = HtmlService.createTemplateFromFile('SubmissionForm').evaluate();
      break;
    case 'Profile':
      htmlOutput = HtmlService.createTemplateFromFile('Profile').evaluate();
      break;
    case 'Admin':
      htmlOutput = HtmlService.createTemplateFromFile('Admin').evaluate();
      break;
    case 'AdminLog':
      htmlOutput = HtmlService.createTemplateFromFile('AdminLog').evaluate();
      break;
    default:
      // ถ้าขอหน้าที่ไม่มีในระบบ ให้ส่งกลับไปหน้าแรกเสมอ
      htmlOutput = HtmlService.createTemplateFromFile('Index').evaluate();
  }
  
  // ตั้งค่าหัวข้อเว็บและอนุญาตให้ฝังใน Google Sites
  return htmlOutput.setTitle('ระบบส่งแผนการสอนออนไลน์').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ฟังก์ชัน include ต้องมีอยู่ด้วย หากคุณใช้ <?!= include(...) ?>
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Includes HTML content from another file into the main template.
 * Used for modularizing HTML (e.g., Stylesheet, JavaScript).
 * @param {string} filename The name of the HTML file to include.
 * @returns {string} The raw content of the HTML file.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


// ----- UTILITIES (CORE HELPERS) -----

/**
 * Saves a Base64 encoded string as a file in a specified Google Drive folder.
 * @param {string} base64Data The Base64 string of the file.
 * @param {string} fileName The desired name for the file.
 * @param {string} folderId The ID of the Google Drive folder to save the file in.
 * @returns {string} The URL of the newly created file.
 */
function saveBase64FileToDrive(base64Data, fileName, folderId) {
  try {
    const splitBase64 = base64Data.split(',');
    const contentType = splitBase64[0].split(';')[0].replace('data:', '');
    const bytes = Utilities.base64Decode(splitBase64[1]);
    const blob = Utilities.newBlob(bytes, contentType, fileName);
    
    const folder = DriveApp.getFolderById(folderId);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return file.getUrl();
  } catch (e) {
    console.error(`Error in saveBase64FileToDrive: ${e.toString()}`);
    logActivity('SYSTEM_ERROR', 'File_Upload', `Failed to save file ${fileName}. Error: ${e.message}`);
    return null;
  }
}

/**
 * Creates a subfolder for a user within the main lesson plan folder if it doesn't exist.
 * @param {string} username The username to use for the folder name.
 * @returns {string} The ID of the user's folder.
 */
function getOrCreateUserFolder(username) {
    const parentFolder = DriveApp.getFolderById(LESSON_PLANS_FOLDER_ID);
    const folders = parentFolder.getFoldersByName(username);
  
    if (folders.hasNext()) {
      return folders.next().getId();
    } else {
      return parentFolder.createFolder(username).getId();
    }
}


/**
 * Logs an action to the Activity_Log sheet.
 * @param {string} username The user performing the action.
 * @param {string} action The type of action (e.g., 'LOGIN', 'SUBMIT_PLAN').
 * @param {string} details Additional details about the action.
 */
function logActivity(username, action, details) {
  try {
    const timestamp = new Date();
    logSheet.appendRow([timestamp, username, action, details]);
  } catch(e) {
    console.error(`Failed to write to Activity_Log. Action: ${action}, Details: ${details}. Error: ${e.toString()}`);
  }
}


// ----- USER AUTHENTICATION & REGISTRATION -----

/**
 * Checks if this is the very first registration.
 * @returns {boolean} True if no users are registered yet.
 */
function checkFirstUser() {
    return regSheet.getLastRow() < 2;
}

/**
 * Registers a new user.
 * @param {object} userInfo An object containing all user registration data.
 * @returns {object} A result object with success status and a message.
 */
function registerUser(userInfo) {
  try {
    // Check for duplicate username
    const usernames = regSheet.getRange(2, 7, regSheet.getLastRow(), 1).getValues().flat();
    if (usernames.includes(userInfo.username)) {
      return { success: false, message: 'ชื่อผู้ใช้งานนี้มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น' };
    }
    
    const isFirstUser = checkFirstUser();
    const status = isFirstUser ? 'อนุมัติแล้ว' : 'รอการอนุมัติ';
    const position = isFirstUser ? 'Admin' : userInfo.position;

    // Upload images and get URLs
    const profilePicUrl = saveBase64FileToDrive(userInfo.profilePic, `profile_${userInfo.username}.png`, PROFILE_PICS_FOLDER_ID);
    const signatureUrl = saveBase64FileToDrive(userInfo.signature, `signature_${userInfo.username}.png`, PROFILE_PICS_FOLDER_ID);

    if (!profilePicUrl || !signatureUrl) {
        return { success: false, message: 'เกิดข้อผิดพลาดในการอัปโหลดไฟล์รูปภาพ' };
    }

    const newRow = [
      profilePicUrl, userInfo.prefix, userInfo.fullName, position, userInfo.academicStanding, 
      signatureUrl, userInfo.username, userInfo.password, userInfo.email, status
    ];
    
    regSheet.appendRow(newRow);
    logActivity(userInfo.username, 'REGISTER', `New user registered with position: ${position}. Status: ${status}.`);

    return { success: true, message: isFirstUser ? 'ลงทะเบียน Admin คนแรกสำเร็จ!' : 'ลงทะเบียนสำเร็จ! บัญชีของคุณกำลังรอการอนุมัติจากผู้ดูแลระบบ' };
  } catch (e) {
    console.error(`Registration Error: ${e.toString()}`);
    return { success: false, message: `เกิดข้อผิดพลาดในการลงทะเบียน: ${e.message}` };
  }
}

/**
 * Logs a user into the system.
 * @param {string} username The user's username.
 * @param {string} password The user's password.
 * @returns {object} A result object with success status and user data if successful.
 */
function loginUser(username, password) {
  try {
    const data = regSheet.getDataRange().getValues();
    // Skip header row, start from i=1
    for (let i = 1; i < data.length; i++) {
      if (data[i][6] === username && data[i][7] === password) {
        if (data[i][9] === 'อนุมัติแล้ว') {
          logActivity(username, 'LOGIN', 'User logged in successfully.');
          return { 
            success: true, 
            message: 'เข้าสู่ระบบสำเร็จ!',
            user: {
                username: data[i][6],
                fullName: data[i][2],
                position: data[i][3]
            }
          };
        } else {
          return { success: false, message: 'บัญชีของคุณกำลังรอการอนุมัติจากผู้ดูแลระบบ' };
        }
      }
    }
    return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  } catch (e) {
    console.error(`Login Error: ${e.toString()}`);
    return { success: false, message: `เกิดข้อผิดพลาด: ${e.message}` };
  }
}

/**
 * Handles the password recovery process.
 * @param {string} email The user's registered email.
 * @returns {object} A result object with success status and a message.
 */
function forgotPassword(email) {
    try {
        const data = regSheet.getDataRange().getValues();
        let userRow = -1;

        for (let i = 1; i < data.length; i++) {
            if (data[i][8].toLowerCase() === email.toLowerCase()) {
                userRow = i + 1; // 1-based index for sheet range
                break;
            }
        }

        if (userRow === -1) {
            return { success: false, message: 'ไม่พบอีเมลนี้ในระบบ' };
        }

        const tempPassword = Math.random().toString(36).slice(-8);
        regSheet.getRange(userRow, 8).setValue(tempPassword); // Update password in column H (8th column)

        const subject = "กู้คืนรหัสผ่าน - ระบบส่งแผนการสอนออนไลน์";
        const body = `สวัสดีคุณ ${data[userRow-1][2]},\n\nรหัสผ่านชั่วคราวของคุณคือ: ${tempPassword}\n\nกรุณาใช้รหัสผ่านนี้เพื่อเข้าสู่ระบบ และทำการเปลี่ยนรหัสผ่านในหน้าโปรไฟล์ทันทีเพื่อความปลอดภัย\n\nขอแสดงความนับถือ,\nระบบส่งแผนการสอนออนไลน์`;
        
        MailApp.sendEmail(email, subject, body);
        logActivity(data[userRow-1][6], 'PASSWORD_RECOVERY', `Temporary password sent to ${email}.`);

        return { success: true, message: 'รหัสผ่านชั่วคราวถูกส่งไปยังอีเมลของคุณแล้ว' };
    } catch (e) {
        console.error(`Password Recovery Error: ${e.toString()}`);
        return { success: false, message: `เกิดข้อผิดพลาดในการกู้คืนรหัสผ่าน: ${e.message}` };
    }
}


// ----- USER & ADMIN MANAGEMENT -----

/**
 * Retrieves the profile data for the logged-in user.
 * @param {string} username The username of the logged-in user.
 * @returns {object|null} An object with user data or null if not found.
 */
function getUserProfile(username) {
  const data = regSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][6] === username) {
      return {
        profilePicUrl: data[i][0],
        prefix: data[i][1],
        fullName: data[i][2],
        position: data[i][3],
        academicStanding: data[i][4],
        signatureUrl: data[i][5],
        username: data[i][6],
        email: data[i][8]
        // Do NOT return password
      };
    }
  }
  return null;
}

/**
 * Updates a user's profile information.
 * @param {object} profileData The new profile data from the form.
 * @returns {object} A result object with success status and message.
 */
function updateUserProfile(profileData) {
  try {
    const data = regSheet.getDataRange().getValues();
    let userRow = -1;
    for (let i = 1; i < data.length; i++) {
        if (data[i][6] === profileData.username) {
            userRow = i + 1;
            break;
        }
    }

    if (userRow === -1) {
        return { success: false, message: 'ไม่พบผู้ใช้งาน' };
    }

    // Update fields
    regSheet.getRange(userRow, 2).setValue(profileData.prefix);
    regSheet.getRange(userRow, 3).setValue(profileData.fullName);
    regSheet.getRange(userRow, 5).setValue(profileData.academicStanding);
    regSheet.getRange(userRow, 9).setValue(profileData.email);
    
    // Update password if a new one is provided
    if (profileData.newPassword) {
      regSheet.getRange(userRow, 8).setValue(profileData.newPassword);
    }
    
    // Update profile picture if a new one is uploaded
    if (profileData.profilePic) {
      const newPicUrl = saveBase64FileToDrive(profileData.profilePic, `profile_${profileData.username}.png`, PROFILE_PICS_FOLDER_ID);
      regSheet.getRange(userRow, 1).setValue(newPicUrl);
    }

    // Update signature if a new one is uploaded
    if (profileData.signature) {
      const newSigUrl = saveBase64FileToDrive(profileData.signature, `signature_${profileData.username}.png`, PROFILE_PICS_FOLDER_ID);
      regSheet.getRange(userRow, 6).setValue(newSigUrl);
    }

    logActivity(profileData.username, 'UPDATE_PROFILE', 'User profile has been updated.');
    return { success: true, message: 'อัปเดตข้อมูลโปรไฟล์เรียบร้อยแล้ว' };
  } catch (e) {
    console.error(`Update Profile Error: ${e.toString()}`);
    return { success: false, message: `เกิดข้อผิดพลาด: ${e.message}` };
  }
}

/**
 * Retrieves a list of all users for the admin management page.
 * @returns {Array<object>} An array of user objects.
 */
function getUsersForAdmin() {
    const data = regSheet.getRange(2, 2, regSheet.getLastRow() - 1, 9).getValues();
    const users = data.map(row => ({
        prefix: row[0],
        fullName: row[1],
        position: row[2],
        username: row[5],
        email: row[7],
        status: row[8]
    }));
    return users;
}

/**
 * Approves a user's registration.
 * @param {string} adminUsername The username of the admin performing the action.
 * @param {string} userToApprove The username of the user to be approved.
 * @returns {object} A result object with success status and a message.
 */
function approveUser(adminUsername, userToApprove) {
    try {
        const data = regSheet.getDataRange().getValues();
        let userRow = -1;
        for (let i = 1; i < data.length; i++) {
            if (data[i][6] === userToApprove) {
                userRow = i + 1;
                break;
            }
        }

        if (userRow === -1) {
            return { success: false, message: 'ไม่พบผู้ใช้งานที่ต้องการอนุมัติ' };
        }

        regSheet.getRange(userRow, 10).setValue('อนุมัติแล้ว'); // Update status in column J
        logActivity(adminUsername, 'APPROVE_USER', `Approved user: ${userToApprove}`);
        
        // Optional: Send an email notification to the newly approved user
        const userEmail = regSheet.getRange(userRow, 9).getValue();
        const userName = regSheet.getRange(userRow, 3).getValue();
        MailApp.sendEmail(userEmail, "บัญชีของคุณได้รับการอนุมัติแล้ว", `สวัสดีคุณ ${userName}, บัญชีของคุณในระบบส่งแผนการสอนออนไลน์ได้รับการอนุมัติเรียบร้อยแล้ว ตอนนี้คุณสามารถเข้าสู่ระบบได้`);

        return { success: true, message: `อนุมัติผู้ใช้ ${userToApprove} เรียบร้อยแล้ว` };
    } catch (e) {
        console.error(`Approve User Error: ${e.toString()}`);
        return { success: false, message: `เกิดข้อผิดพลาด: ${e.message}` };
    }
}


// ----- LESSON PLAN SUBMISSION & DATA -----

/**
 * Retrieves data for dependent dropdowns from the 'ข้อมูลวิชา' sheet.
 * @returns {Array<object>} An array of subject data objects.
 */
function getDependentDropdownData() {
    // Return all data and let client-side handle the filtering
    return subjectSheet.getRange(2, 1, subjectSheet.getLastRow() - 1, 4).getValues()
        .map(row => ({
            class: row[0],
            subjectName: row[1],
            subjectCode: row[2],
            course: row[3]
        }));
}

/**
 * Submits a new lesson plan.
 * @param {object} planData The lesson plan data from the form.
 * @returns {object} A result object with success status and a message.
 */
function submitLessonPlan(planData) {
  try {
    const userFolderId = getOrCreateUserFolder(planData.submitterUsername);

    // Upload files
    const file1Url = saveBase64FileToDrive(planData.file1_base64, planData.file1_name, userFolderId);
    const file2Url = saveBase64FileToDrive(planData.file2_base64, planData.file2_name, userFolderId);

    if (!file1Url || !file2Url) {
        return { success: false, message: 'เกิดข้อผิดพลาดในการอัปโหลดไฟล์แผนการสอน' };
    }
    
    const submissionTime = new Date();
    const newRow = [
      planData.academicYear, submissionTime, planData.submitterFullName, planData.learningArea,
      planData.class, planData.subjectName, planData.subjectCode, planData.course,
      planData.additionalLink, file1Url, file2Url,
      'รอตรวจสอบ', '', // ฝ่ายวิชาการ
      'รอตรวจสอบ', '', // รองผู้อำนวยการฯ
      'รอตรวจสอบ', ''  // ผู้อำนวยการฯ
    ];

    planSheet.appendRow(newRow);
    logActivity(planData.submitterUsername, 'SUBMIT_PLAN', `Submitted plan for subject ${planData.subjectCode}`);

    // Notify the first approver (ฝ่ายวิชาการ)
    sendNotification('ฝ่ายวิชาการ', 'New Plan Submission', `มีแผนการสอนใหม่จากคุณ ${planData.submitterFullName} (${planData.subjectCode}) รอการตรวจสอบ`);

    return { success: true, message: 'ส่งแผนการสอนเรียบร้อยแล้ว!' };
  } catch (e) {
    console.error(`Submit Plan Error: ${e.toString()}`);
    return { success: false, message: `เกิดข้อผิดพลาด: ${e.message}` };
  }
}

// ----- APPROVAL WORKFLOW -----

/**
 * Processes an approval or revision request from an approver.
 * @param {number} rowId The row number of the plan in the sheet.
 * @param {string} approverRole The role of the person approving (e.g., 'ฝ่ายวิชาการ').
 * @param {string} decision 'อนุมัติแล้ว' or 'แจ้งแก้ไข'.
 * @param {string} comment The comment from the approver.
 * @param {string} approverUsername The username of the approver.
 * @returns {object} A result object with success status and message.
 */
function processApproval(rowId, approverRole, decision, comment, approverUsername) {
  try {
    const row = parseInt(rowId);
    let statusCol, commentCol, nextRole = null;

    // Determine which columns to update and who to notify next
    switch(approverRole) {
      case 'ฝ่ายวิชาการ':
        statusCol = 12; commentCol = 13;
        nextRole = 'รองผู้อำนวยการสถานศึกษา';
        break;
      case 'รองผู้อำนวยการสถานศึกษา':
        statusCol = 14; commentCol = 15;
        nextRole = 'ผู้อำนวยการสถานศึกษา';
        break;
      case 'ผู้อำนวยการสถานศึกษา':
        statusCol = 16; commentCol = 17;
        nextRole = 'SUBMITTER'; // Final approval
        break;
      default:
        return { success: false, message: 'ไม่พบตำแหน่งผู้ตรวจสอบ' };
    }

    // Update sheet with decision and comment
    planSheet.getRange(row, statusCol).setValue(decision);
    planSheet.getRange(row, commentCol).setValue(comment);

    const planData = planSheet.getRange(row, 1, 1, planSheet.getLastColumn()).getValues()[0];
    const submitterFullName = planData[2];
    const subjectCode = planData[6];

    if (decision === 'อนุมัติแล้ว') {
      logActivity(approverUsername, 'APPROVE_PLAN', `Approved plan for ${subjectCode} by ${approverRole}.`);
      
      const notificationMessage = `แผนการสอน (${subjectCode}) ของคุณ ${submitterFullName} ได้รับการอนุมัติโดย ${approverRole} และรอการตรวจสอบในขั้นต่อไป`;
      
      if (nextRole === 'SUBMITTER') {
        // Final approval, notify the original teacher
        // TODO: Need a way to get the submitter's contact info. For now, we assume a general notification.
        sendNotification('ผู้ส่ง (ครูผู้สอน)', 'Plan Approved', `แผนการสอนของคุณ (${subjectCode}) ได้รับการอนุมัติเรียบร้อยแล้ว ✅`);
      } else {
        sendNotification(nextRole, 'Plan Ready for Approval', notificationMessage);
      }

    } else if (decision === 'แจ้งแก้ไข') {
      logActivity(approverUsername, 'REQUEST_REVISION', `Requested revision for ${subjectCode} by ${approverRole}. Comment: ${comment}`);
      
      // Notify submitter about revision request
      sendNotification('ผู้ส่ง (ครูผู้สอน)', 'Revision Required', `แผนการสอน (${subjectCode}) ของคุณต้องการการแก้ไขจาก ${approverRole}. เหตุผล: ${comment}`);
      
      // Delete files from Drive and clear URLs in Sheet
      const file1Url = planData[9];
      const file2Url = planData[10];

      try { DriveApp.getFileById(file1Url.match(/d\/(.+)\//)[1]).setTrashed(true); } catch(e) { console.warn("Could not delete file 1:", file1Url); }
      try { DriveApp.getFileById(file2Url.match(/d\/(.+)\//)[1]).setTrashed(true); } catch(e) { console.warn("Could not delete file 2:", file2Url); }

      planSheet.getRange(row, 10, 1, 2).clearContent(); // Clear file URLs

    }

    return { success: true, message: 'ดำเนินการเรียบร้อยแล้ว' };
  } catch (e) {
    console.error(`Process Approval Error: ${e.toString()}`);
    return { success: false, message: `เกิดข้อผิดพลาด: ${e.message}` };
  }
}

/**
 * Resubmits an edited lesson plan.
 * This is called after a user fixes a plan that was sent back for revision.
 * @param {object} resubmissionData Data for the resubmission.
 * @returns {object} A result object with success status and message.
 */
function resubmitEditedPlan(resubmissionData) {
    try {
        const row = parseInt(resubmissionData.rowId);
        const userFolderId = getOrCreateUserFolder(resubmissionData.submitterUsername);

        // Upload new files
        const newFile1Url = saveBase64FileToDrive(resubmissionData.file1_base64, resubmissionData.file1_name, userFolderId);
        const newFile2Url = saveBase64FileToDrive(resubmissionData.file2_base64, resubmissionData.file2_name, userFolderId);

        if (!newFile1Url || !newFile2Url) {
            return { success: false, message: 'เกิดข้อผิดพลาดในการอัปโหลดไฟล์ใหม่' };
        }

        // Update sheet with new file URLs and reset all approval statuses
        planSheet.getRange(row, 10).setValue(newFile1Url);
        planSheet.getRange(row, 11).setValue(newFile2Url);
        // Reset statuses for วิชาการ, รองฯ, ผอ. and their comments
        planSheet.getRange(row, 12, 1, 6).setValues([['รอตรวจสอบ', '', 'รอตรวจสอบ', '', 'รอตรวจสอบ', '']]);
        
        const subjectCode = planSheet.getRange(row, 7).getValue();
        logActivity(resubmissionData.submitterUsername, 'RESUBMIT_PLAN', `Resubmitted plan for subject ${subjectCode}`);

        // Notify the first approver again
        const submitterFullName = planSheet.getRange(row, 3).getValue();
        sendNotification('ฝ่ายวิชาการ', 'Plan Resubmitted', `มีการส่งแผนการสอนที่แก้ไขแล้วจากคุณ ${submitterFullName} (${subjectCode}) รอการตรวจสอบ`);

        return { success: true, message: 'ส่งแผนการสอนที่แก้ไขเรียบร้อยแล้ว' };

    } catch (e) {
        console.error(`Resubmit Plan Error: ${e.toString()}`);
        return { success: false, message: `เกิดข้อผิดพลาด: ${e.message}` };
    }
}


// ----- DASHBOARD & LOG DATA -----

/**
 * Retrieves lesson plan data for the dashboard based on user role.
 * @param {string} username The username of the logged-in user.
 * @param {string} userRole The role/position of the logged-in user.
 * @returns {Array<object>} An array of lesson plan data objects.
 */
function getDashboardData(username, userRole) {
    const data = planSheet.getDataRange().getValues();
    const headers = data.shift(); // Remove header row
    
    const result = data.map((row, index) => {
        let rowData = {};
        headers.forEach((header, i) => {
            rowData[header] = row[i];
        });
        rowData.rowId = index + 2; // Add sheet row number for easy updates
        return rowData;
    }).filter(item => {
        // Admins and approvers see everything
        const approverRoles = ['Admin', 'ฝ่ายวิชาการ', 'รองผู้อำนวยการสถานศึกษา', 'ผู้อำนวยการสถานศึกษา'];
        if (approverRoles.includes(userRole)) {
            return true;
        }
        // Teachers see only their own submissions
        // We need to match by full name here, as username isn't in this sheet.
        // A better approach would be to store username in the plan sheet.
        // For now, let's assume we can get the user's full name.
        // This part needs a function call to get full name from username.
        // Let's assume the client passes the fullName for simplicity here.
        const userFullName = getUserProfile(username).fullName;
        return item['ชื่อ-นามสกุล'] === userFullName;
    });

    return result.reverse(); // Show newest first
}

/**
 * Retrieves all data from the Activity_Log sheet.
 * @returns {Array<object>} An array of log entry objects.
 */
function getActivityLog() {
    const data = logSheet.getDataRange().getValues();
    const headers = data.shift();
    return data.map(row => {
        let logEntry = {};
        headers.forEach((header, i) => {
            logEntry[header] = row[i];
        });
        return logEntry;
    }).reverse(); // Show most recent logs first
}

// ----- NOTIFICATIONS -----

/**
 * Sends a notification via Telegram.
 * @param {string} role The role to notify (e.g., 'ฝ่ายวิชาการ').
 * @param {string} title The title of the message.
 * @param {string} message The message content.
 */
function sendNotification(role, title, message) {
    try {
        const notifData = notificationSheet.getDataRange().getValues();
        let chatIds = [];

        // Find chat ID(s) for the specified role
        for (let i = 1; i < notifData.length; i++) {
            if (notifData[i][0] === role) {
                chatIds.push(notifData[i][1]);
            }
        }

        if (chatIds.length === 0) {
            console.warn(`No Telegram Chat ID found for role: ${role}`);
            return; // No one to notify
        }

        // It's better to manage the Telegram Bot Token securely, e.g., in Script Properties
        const TELEGRAM_BOT_TOKEN = "7834433817:AAGCTzx_Iff4HNA4VsvE1ryU1U7nW3vH9xU"; // <-- IMPORTANT: Replace with your bot token
        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const fullMessage = `🔔 *${title}*\n\n${message}`;

        chatIds.forEach(chatId => {
            const payload = {
                'method': 'post',
                'contentType': 'application/json',
                'payload': JSON.stringify({
                    'chat_id': String(chatId),
                    'text': fullMessage,
                    'parse_mode': 'Markdown'
                })
            };
            UrlFetchApp.fetch(telegramUrl, payload);
        });

    } catch (e) {
        console.error(`Telegram Notification Error: ${e.toString()}`);
        logActivity('SYSTEM', 'NOTIFICATION_ERROR', `Failed to send Telegram to role ${role}. Error: ${e.message}`);
    }
    // Note: Email notification logic can be added here as well, using MailApp.sendEmail()
}
