function greet(name) {
  return `Hello, ${name}!`;
}

const target = process.argv[2] || "world";
console.log(greet(target));
