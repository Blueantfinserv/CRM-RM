const USERS = [
  {
    name: "Avesh",
    mobile: "9811331799",
    password: "Avesh@1799",
    role: "SM",
    email: "avesh@blueantindia.com"
  },
  {
    name: "Rajnish",
    mobile: "9811336570",
    password: "Rajnish@6570",
    role: "SM",
    email: "rajnish@blueantindia.com"
  },
  {
    name: "Rahul",
    mobile: "9811332561",
    password: "Blue@129543",
    role: "SM",
    email: "rahul@blueantindia.com"
  },
  {
    name: "Mukesh",
    mobile: "9811330319",
    password: "Mukesh@0319",
    role: "SM",
    email: "service.desk@blueantindia.com"
  },
  {
    name: "Sudeep",
    mobile: "8448189777",
    password: "Sudeep@9777",
    role: "SM",
    email: "deeppandey38@gmail.com"
  },
  {
    name: "Monika",
    mobile: "9319259187",
    password: "Monika@9187",
    role: "SM",
    email: "blueantmf3@gmail.com"
  },
  {
    name: "Vikram",
    mobile: "8130200389",
    password: "Vikram6694",
    role: "SM",
    email: "vikramaggrawal67@gmail.com"
  },
  {
    name: "Divya",
    mobile: "9911333256",
    password: "Divya@3256",
    role: "SM",
    email: "blueantmf4@gmail.com"
  },
  {
    name: "Yogendra",
    mobile: "9319696406",
    password: "Yogi@346",
    role: "SM",
    email: "yogeshyogikushwah@gmail.com"
  },
  {
    name: "ARYAN",
    mobile: "9304264007",
    password: "Aryan",
    role: "SM",
    email: "aryan10kumar11@gmail.com"
  }
];

function login() {
  const mobile = document.getElementById("mobile").value.trim();
  const password = document.getElementById("password").value.trim();
  const user = USERS.find(
    u => u.mobile === mobile && u.password === password
  );
  if (!user) {
    alert("Invalid login details");
    return;
  }
  // SAVE SESSION
  sessionStorage.setItem("userName", user.name);
  sessionStorage.setItem("userEmail", user.email);
  sessionStorage.setItem("userRole", user.role);
  localStorage.setItem("userName", user.name);
  localStorage.setItem("userEmail", user.email);
  localStorage.setItem("userRole", user.role);
  // REDIRECT
  window.location.href = "today.html";
}

function togglePassword() {
  const passwordInput = document.getElementById("password");
  const toggleText = document.querySelector(".show");
  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    toggleText.innerText = "Hide";
  } else {
    passwordInput.type = "password";
    toggleText.innerText = "Show";
  }
}