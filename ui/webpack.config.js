const path = require('path');

module.exports = {
  mode: "production",
  devtool: "source-map",
  resolve: { extensions: [".jsx", ".js"] },
  module: {
    rules: [
      {
        test: /\.m?jsx?$/,
        exclude: /(node_modules|bower_components)/,
        loader: 'babel-loader',
        options: {
          presets: [
            '@babel/preset-env',
            '@babel/preset-react',
            {
              plugins: ['@babel/plugin-proposal-class-properties']
            }
          ]
        }
      },
      {
        enforce: "pre",
        test: /\.js$/,
        loader: "source-map-loader"
      },
      {
        test: /\.(png|svg|jpg|gif)$/,
        use: [
          'file-loader',
        ],
      },
    ]
  },
  externals: {
    "react": "React",
    "react-dom": "ReactDOM"
  },
  optimization: {
    minimize: false
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    publicPath: '/dist/',
    filename: 'main.js'
  }
};
